export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---------------- helpers ----------------

function stripTcdbThumbTokens(line: string) {
  // TCDB often includes two (or more) leading "Image thumbnail" columns
  return line.replace(/^(\s*Image\s+thumbnail\s*)+/i, "").trim();
}

function splitLine(line: string) {
  // Prefer tabs (Google Sheets copy/paste), fallback to 2+ spaces
  const hasTabs = line.includes("\t");
  const parts = hasTabs
    ? line.split("\t").map((s) => s.trim())
    : line.split(/\s{2,}/).map((s) => s.trim());

  return parts.filter((p) => p.length > 0);
}

function looksLikeChecklist(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("checklist") ||
    /\bcl\b/i.test(text) ||
    /\bchk\b/i.test(text) ||
    /\bteam\s+checklist\b/i.test(text)
  );
}

function parsePlayerField(raw: string) {
  // Example: "Ron Gant DK, UER"  -> DK => subset, others => variant
  const cleaned = raw.replace(/\s*,\s*/g, ", ").trim();

  let player = cleaned;
  let subset: string | null = null;
  let variant: string | null = null;

  const commaParts = cleaned.split(",").map((s) => s.trim());
  if (commaParts.length > 1) {
    player = commaParts[0];
    const flags = commaParts.slice(1).filter(Boolean);

    if (flags.includes("DK")) subset = "Diamond Kings";

    const other = flags.filter((f) => f !== "DK");
    if (other.length) variant = other.join(", ");
  }

  // Handle "Dave Stieb DK" (no comma)
  const m = player.match(/^(.*)\sDK$/i);
  if (m) {
    player = m[1].trim();
    subset = subset ?? "Diamond Kings";
  }

  return { player, subset, variant };
}

async function ensureLegacyPlaceholderSet() {
  // Card.setId is still required in your schema (legacy relationship)
  const id = "LEGACY_PLACEHOLDER";
  const existing = await prisma.set.findUnique({ where: { id } });
  if (existing) return;

  await prisma.set.create({
    data: {
      id,
      year: null,
      brand: "Legacy Placeholder",
      sport: null,
      packPriceCents: 0,
    },
  });
}

type ParsedRow = {
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
};

function parsePaste(raw: string): ParsedRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const out: ParsedRow[] = [];

  for (const rawLine of lines) {
    const cleaned = stripTcdbThumbTokens(rawLine);
    if (!cleaned) continue;

    const parts = splitLine(cleaned);
    if (parts.length < 1) continue;

    const cardNumber = (parts[0] ?? "").trim();
    const playerFieldRaw = (parts[1] ?? "").trim();
    const teamRaw = (parts[2] ?? "").trim();

    if (!cardNumber) continue;

    const hint = [playerFieldRaw, teamRaw, cleaned].join(" ");
    const isChecklist = looksLikeChecklist(hint);

    if (!playerFieldRaw && !isChecklist) continue;

    let player = playerFieldRaw || "Checklist";
    let subset: string | null = null;
    let variant: string | null = null;

    if (isChecklist) {
      subset = "Checklist";
      if (!playerFieldRaw) player = "Checklist";
    } else {
      const parsed = parsePlayerField(playerFieldRaw);
      player = parsed.player;
      subset = parsed.subset;
      variant = parsed.variant;
    }

    out.push({
      cardNumber: String(cardNumber),
      player,
      team: teamRaw ? teamRaw : null,
      subset: subset ?? null,
      variant: variant ?? null,
    });
  }

  return out;
}

// ---------------- handler ----------------

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Support BOTH payload shapes so nothing breaks:
    // New UI: { productSetIdOverride, data }
    // Old UI: { setIdOverride, text }
    const productSetIdOverride = (body?.productSetIdOverride ?? "").toString().trim();
    const data = (body?.data ?? "").toString();

    const setIdOverride = (body?.setIdOverride ?? "").toString().trim();
    const text = (body?.text ?? "").toString();

    const isProductSetMode = !!productSetIdOverride;

    if (isProductSetMode) {
      if (!data.trim()) {
        return NextResponse.json({ ok: false, error: "No paste data provided" }, { status: 400 });
      }

      const productSetId = productSetIdOverride;
      const productSet = await prisma.productSet.findUnique({ where: { id: productSetId } });
      if (!productSet) {
        return NextResponse.json({ ok: false, error: `ProductSet not found: ${productSetId}` }, { status: 404 });
      }

      await ensureLegacyPlaceholderSet();

      const parsed = parsePaste(data);
      if (parsed.length === 0) {
        return NextResponse.json({ ok: false, error: "No valid rows found to import" }, { status: 400 });
      }

      // Faster + safe, and IMPORTANTLY: no `insert` field anywhere.
      let inserted = 0;
      let updated = 0;

      for (const r of parsed) {
        const existing = await prisma.card.findUnique({
          where: {
            productSetId_cardNumber: {
              productSetId,
              cardNumber: r.cardNumber,
            },
          },
        });

        if (!existing) {
          await prisma.card.create({
            data: {
              setId: "LEGACY_PLACEHOLDER",
              productSetId,
              cardNumber: r.cardNumber,
              player: r.player,
              team: r.team,
              position: null,
              subset: r.subset,
              variant: r.variant,
              bookValue: 0,
              quantityOwned: 0,
              frontImageUrl: null,
              backImageUrl: null,
            },
          });
          inserted++;
        } else {
          await prisma.card.update({
            where: { id: existing.id },
            data: {
              player: r.player,
              team: r.team,
              subset: r.subset,
              variant: r.variant,
            },
          });
          updated++;
        }
      }

      return NextResponse.json({
        ok: true,
        mode: "productSet",
        productSetId,
        inserted,
        updated,
        total: parsed.length,
      });
    }

    // ------- Legacy Set mode (keep it working) -------
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "No paste text provided" }, { status: 400 });
    }

    const setId = setIdOverride || "Unknown Set";
    await prisma.set.upsert({
      where: { id: setId },
      update: {},
      create: { id: setId },
    });

    const parsed = parsePaste(text);
    if (parsed.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid rows found to import" }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;

    for (const r of parsed) {
      const existing = await prisma.card.findUnique({
        where: { setId_cardNumber: { setId, cardNumber: r.cardNumber } },
      });

      if (!existing) {
        await prisma.card.create({
          data: {
            setId,
            cardNumber: r.cardNumber,
            player: r.player,
            team: r.team,
            position: null,
            subset: r.subset,
            variant: r.variant,
            bookValue: 0,
            quantityOwned: 0,
            frontImageUrl: null,
            backImageUrl: null,
          },
        });
        inserted++;
      } else {
        await prisma.card.update({
          where: { id: existing.id },
          data: {
            player: r.player,
            team: r.team,
            subset: r.subset,
            variant: r.variant,
          },
        });
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "legacySet",
      setId,
      inserted,
      updated,
      total: parsed.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
