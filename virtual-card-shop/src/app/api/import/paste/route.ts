export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// --- helpers ----------------------------------------------------

function stripTcdbThumbTokens(line: string) {
  // TCDB often includes two (or more) leading "Image thumbnail" columns
  // Remove any repeated "Image thumbnail" at the start of the line.
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
  // Example: "Ron Gant DK, UER"
  // DK -> subset, other flags -> variant
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
  // Card.setId is still required in your schema (legacy relationship),
  // so we always have a safe Set to attach to when importing into ProductSets.
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

// --- handler ----------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // NEW payload (ProductSet import)
    const productSetIdOverride = (body?.productSetIdOverride ?? "").toString().trim();
    const data = (body?.data ?? "").toString();

    // LEGACY payload (Set import)
    const setIdOverride = (body?.setIdOverride ?? "").toString().trim();
    const text = (body?.text ?? "").toString();

    const isProductSetMode = !!productSetIdOverride;

    // Validate input based on mode
    if (isProductSetMode) {
      if (!data.trim()) {
        return NextResponse.json({ ok: false, error: "No paste data provided" }, { status: 400 });
      }

      // Ensure ProductSet exists
      const productSetId = productSetIdOverride;
      const productSet = await prisma.productSet.findUnique({ where: { id: productSetId } });
      if (!productSet) {
        return NextResponse.json({ ok: false, error: `ProductSet not found: ${productSetId}` }, { status: 404 });
      }

      await ensureLegacyPlaceholderSet();

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ line: number; reason: string; raw: string }> = [];

      const lines = data
        .split(/\r?\n/)
        .map((l: string) => l.trimEnd())
        .filter((l: string) => l.trim().length > 0);

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];

        try {
          const cleaned = stripTcdbThumbTokens(rawLine);
          if (!cleaned) {
            skipped++;
            continue;
          }

          const parts = splitLine(cleaned);

          // Expected (after stripping thumbs):
          // [cardNumber, playerField, team, ...]
          if (parts.length < 1) {
            skipped++;
            continue;
          }

          const cardNumber = (parts[0] ?? "").trim();
          const playerFieldRaw = (parts[1] ?? "").trim();
          const teamRaw = (parts[2] ?? "").trim();

          if (!cardNumber) {
            skipped++;
            continue;
          }

          const checklistHintText = [playerFieldRaw, teamRaw, cleaned].join(" ");
          const isChecklist = looksLikeChecklist(checklistHintText);

          if (!playerFieldRaw && !isChecklist) {
            skipped++;
            continue;
          }

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

          // IMPORTANT: Do NOT include `insert` here.
          // Insert/Base is handled at ProductSet level now.
          const existing = await prisma.card.findUnique({
            where: {
              productSetId_cardNumber: {
                productSetId,
                cardNumber: String(cardNumber),
              },
            },
          });

          if (!existing) {
            await prisma.card.create({
              data: {
                setId: "LEGACY_PLACEHOLDER",
                productSetId,
                cardNumber: String(cardNumber),
                player,
                team: teamRaw || null,
                position: null,
                subset: subset || null,
                variant: variant || null,
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
                player,
                team: teamRaw || null,
                subset: subset || null,
                variant: variant || null,
              },
            });
            updated++;
          }
        } catch (e: any) {
          errors.push({
            line: i + 1,
            reason: e?.message ?? String(e),
            raw: rawLine,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        mode: "productSet",
        productSetId: productSetIdOverride,
        inserted,
        updated,
        skipped,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      });
    }

    // ----- LEGACY MODE (Set import) -----
    const setId = setIdOverride || "Unknown Set";

    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "No paste text provided" }, { status: 400 });
    }

    // Ensure the Set exists (minimal; you can enrich later)
    await prisma.set.upsert({
      where: { id: setId },
      update: {},
      create: { id: setId },
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ line: number; reason: string; raw: string }> = [];

    const lines = text
      .split(/\r?\n/)
      .map((l: string) => l.trimEnd())
      .filter((l: string) => l.trim().length > 0);

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];

      try {
        const cleaned = stripTcdbThumbTokens(rawLine);
        if (!cleaned) {
          skipped++;
          continue;
        }

        const parts = splitLine(cleaned);

        if (parts.length < 1) {
          skipped++;
          continue;
        }

        const cardNumber = (parts[0] ?? "").trim();
        const playerFieldRaw = (parts[1] ?? "").trim();
        const teamRaw = (parts[2] ?? "").trim();

        if (!cardNumber) {
          skipped++;
          continue;
        }

        const checklistHintText = [playerFieldRaw, teamRaw, cleaned].join(" ");
        const isChecklist = looksLikeChecklist(checklistHintText);

        if (!playerFieldRaw && !isChecklist) {
          skipped++;
          continue;
        }

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

        const existing = await prisma.card.findUnique({
          where: { setId_cardNumber: { setId, cardNumber: String(cardNumber) } },
        });

        if (!existing) {
          await prisma.card.create({
            data: {
              setId,
              cardNumber: String(cardNumber),
              player,
              team: teamRaw || null,
              position: null,
              subset: subset || null,
              variant: variant || null,
              bookValue: 0,
              quantityOwned: 0,
              frontImageUrl: null,
              backImageUrl: null,
              // DO NOT set `insert` here either.
            },
          });
          inserted++;
        } else {
          await prisma.card.update({
            where: { id: existing.id },
            data: {
              player,
              team: teamRaw || null,
              subset: subset || null,
              variant: variant || null,
            },
          });
          updated++;
        }
      } catch (e: any) {
        errors.push({
          line: i + 1,
          reason: e?.message ?? String(e),
          raw: rawLine,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "legacySet",
      setId,
      inserted,
      updated,
      skipped,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
