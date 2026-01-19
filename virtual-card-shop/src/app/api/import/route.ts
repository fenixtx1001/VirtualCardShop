import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ImportBody = {
  productSetIdOverride?: string;
  data?: string;
};

function cleanCell(s: string | undefined | null) {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

function splitCols(line: string) {
  // Google Sheets copies are tab-separated.
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());

  // TCDB sometimes copies as fixed-width spaced columns
  return line.split(/\s{2,}/g).map((c) => c.trim());
}

// Accept: "1", "12A", "28-103", "28-103A"
function isCardNumberLike(s: string) {
  return /^[0-9]+(?:-[0-9]+)?[A-Za-z]?$/.test(s);
}

function findCardNumberIndex(cols: string[]) {
  return cols.findIndex((c) => isCardNumberLike(c));
}

function nextNonEmptyIndex(cols: string[], startIdx: number) {
  for (let i = startIdx + 1; i < cols.length; i++) {
    if (cols[i] && cols[i].trim() !== "") return i;
  }
  return -1;
}

// Pull DK/UER/etc out of player cell (minimal MVP)
function normalizePlayerAndTags(playerRaw: string) {
  const normalized = playerRaw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const parts = normalized.split(" ").filter(Boolean);

  let subset: string | null = null;
  let variant: string | null = null;

  const upper = parts.map((p) => p.toUpperCase());
  const tagSet = new Set(upper);

  if (tagSet.has("DK")) subset = "Diamond Kings";
  if (tagSet.has("UER")) variant = "UER";
  if (tagSet.has("CL")) variant = variant ? `${variant}, CL` : "CL";

  const stripped = parts.filter((p) => {
    const u = p.toUpperCase();
    return !["DK", "UER", "RC", "CL", "SP"].includes(u);
  });

  const player = stripped.join(" ").trim() || playerRaw.trim();
  return { player, subset, variant };
}

function parseRows(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");

  const rows: any[] = [];

  for (const line of lines) {
    const cols = splitCols(line);

    const cardIdx = findCardNumberIndex(cols);
    if (cardIdx === -1) continue;

    const cardNumber = cols[cardIdx];

    // IMPORTANT: player/team are not always immediately next column.
    const playerIdx = nextNonEmptyIndex(cols, cardIdx);
    if (playerIdx === -1) continue;

    const teamIdx = nextNonEmptyIndex(cols, playerIdx);

    const playerRaw = cols[playerIdx] ?? "";
    const teamRaw = teamIdx === -1 ? "" : cols[teamIdx];

    if (!cardNumber || !playerRaw) continue;

    const { player, subset, variant } = normalizePlayerAndTags(playerRaw);

    rows.push({
      cardNumber,
      player,
      team: cleanCell(teamRaw),
      position: null,
      subset,
      insert: null,
      variant,
      bookValue: 0,
      imageUrl: null,
    });
  }

  return rows;
}

async function ensureLegacyPlaceholderSet() {
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ImportBody;

  const productSetId = body.productSetIdOverride?.trim();
  const raw = body.data ?? "";

  if (!productSetId) {
    return NextResponse.json({ error: "Missing productSetIdOverride" }, { status: 400 });
  }

  const productSet = await prisma.productSet.findUnique({
    where: { id: productSetId },
  });

  if (!productSet) {
    return NextResponse.json({ error: `ProductSet not found: ${productSetId}` }, { status: 404 });
  }

  const parsed = parseRows(raw);

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found to import" },
      { status: 400 }
    );
  }

  // Temporary: Card.setId is still required in your schema
  await ensureLegacyPlaceholderSet();

  const results = { created: 0, updated: 0, total: parsed.length };

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
          position: r.position,
          subset: r.subset,
          insert: r.insert,
          variant: r.variant,
          bookValue: r.bookValue ?? 0,
          imageUrl: r.imageUrl,
        },
      });
      results.created += 1;
    } else {
      await prisma.card.update({
        where: { id: existing.id },
        data: {
          productSetId,
          player: r.player,
          team: r.team,
          position: r.position,
          subset: r.subset,
          insert: r.insert,
          variant: r.variant,
          bookValue: r.bookValue ?? 0,
          imageUrl: r.imageUrl,
        },
      });
      results.updated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    productSetId,
    productId: productSet.productId,
    results,
  });
}
