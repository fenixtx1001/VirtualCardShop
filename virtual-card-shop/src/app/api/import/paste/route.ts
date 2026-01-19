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
  // We'll treat "DK" as subset and other flags as variant notes.
  const cleaned = raw.replace(/\s*,\s*/g, ", ").trim();

  // Split on comma flags at end (best-effort)
  // If there's no comma, still try to detect trailing " DK"
  let player = cleaned;
  let subset: string | null = null;
  let variant: string | null = null;

  // Pull comma-separated suffix flags (e.g., "DK, UER")
  const commaParts = cleaned.split(",").map((s) => s.trim());
  if (commaParts.length > 1) {
    player = commaParts[0];
    const flags = commaParts.slice(1).filter(Boolean);

    // Treat DK as subset when present in flags OR trailing token.
    if (flags.includes("DK")) {
      subset = "Diamond Kings";
    }

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

// --- handler ----------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const setIdOverride = (body?.setIdOverride ?? "").toString().trim();
    const text = (body?.text ?? "").toString();

    // We require setIdOverride for reliable importing (otherwise everything becomes "Unknown Set")
    const setId = setIdOverride || "Unknown Set";

    // Ensure the Set exists (minimal; you can enrich later)
    await prisma.set.upsert({
      where: { id: setId },
      update: {},
      create: { id: setId },
    });

    if (!text.trim()) {
      return NextResponse.json(
        { ok: false, error: "No paste text provided" },
        { status: 400 }
      );
    }

    // Counters
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

        // Typical expectation after stripping thumbnails:
        // [cardNumber, playerField, team, ...optional]
        //
        // But checklist / weird rows sometimes come through with missing pieces.
        // We'll be forgiving:
        // - need cardNumber
        // - accept missing team
        // - accept missing playerField if the row looks like a checklist row
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

        // Detect checklist rows using whatever text we have
        const checklistHintText = [playerFieldRaw, teamRaw, cleaned].join(" ");
        const isChecklist = looksLikeChecklist(checklistHintText);

        // If we have no playerField and it's not a checklist-like row, skip.
        if (!playerFieldRaw && !isChecklist) {
          skipped++;
          continue;
        }

        // For checklist-like rows:
        // - player becomes "Checklist" (or keep any descriptive text if present)
        // - subset becomes "Checklist" unless DK/etc overrides (rare)
        let player = playerFieldRaw || "Checklist";
        let subset: string | null = null;
        let variant: string | null = null;

        if (isChecklist) {
          // If TCDB provides something like "Team Checklist", keep it as player text
          // but still treat the subset as Checklist for filtering/editing later.
          subset = "Checklist";

          // If playerFieldRaw is something like "Checklist" or blank, normalize nicely
          if (!playerFieldRaw) player = "Checklist";
        } else {
          // Normal player card row
          const parsed = parsePlayerField(playerFieldRaw);
          player = parsed.player;
          subset = parsed.subset;
          variant = parsed.variant;
        }

        // Use find/create/update so we can increment inserted/updated accurately
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
              insert: null,
              variant: variant || null,
              bookValue: 0,
              quantityOwned: 0,
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
      setId, // <-- return the setId actually used
      inserted,
      updated,
      skipped,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
