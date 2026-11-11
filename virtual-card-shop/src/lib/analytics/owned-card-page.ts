import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Common analytics view: a collector's owned cards ordered by ownership
 * value. PostgreSQL does the filtering, sorting and pagination before sending
 * the selected rows to Vercel. All other analytics modes retain the original
 * implementation, including comparison views and card-number ordering.
 */
export type OwnedCardPageFilters = {
  userId: string;
  page: number;
  pageSize: number;
  search: string;
  sport: string;
  year: string;
  brand: string;
  productId: string;
  productSetId: string;
  team: string;
  player: string;
};

type CountResult = { total: bigint };
type PageRow = {
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  bookValue: number;
  ownedQty: bigint;
  frontImageUrl: string | null;
  year: number | null;
  brand: string | null;
  sport: string | null;
  productId: string | null;
  productSetId: string | null;
  productSetName: string | null;
};

function friendlyId(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text ? text.replace(/_/g, " ").replace(/\s+/g, " ").trim() : "—";
}

function containsPattern(value: string) {
  return "%" + value.replace(/[\\%_]/g, "\\$&") + "%";
}

export async function queryOwnedCardPage(f: OwnedCardPageFilters) {
  const tests: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.player) tests.push(Prisma.sql`c.player ILIKE ${containsPattern(f.player)} ESCAPE '\\'`);
  if (f.team) tests.push(Prisma.sql`c.team ILIKE ${containsPattern(f.team)} ESCAPE '\\'`);
  if (f.productId) tests.push(Prisma.sql`ps."productId" = ${f.productId}`);
  if (f.productSetId) tests.push(Prisma.sql`c."productSetId" = ${f.productSetId}`);
  if (f.sport) tests.push(Prisma.sql`p.sport = ${f.sport}`);
  if (f.brand) tests.push(Prisma.sql`p.brand = ${f.brand}`);
  if (f.year) {
    const value = parseInt(f.year, 10);
    if (Number.isFinite(value)) tests.push(Prisma.sql`p.year = ${value}`);
  }
  if (f.search) {
    const q = containsPattern(f.search);
    const searchYear = parseInt(f.search, 10);
    const disjuncts: Prisma.Sql[] = [
      Prisma.sql`c.player ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`c.team ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`c."cardNumber" ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`c."productSetId" ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`ps.name ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`p.id ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`p.brand ILIKE ${q} ESCAPE '\\'`,
      Prisma.sql`p.sport ILIKE ${q} ESCAPE '\\'`,
    ];
    if (Number.isFinite(searchYear)) disjuncts.push(Prisma.sql`p.year = ${searchYear}`);
    tests.push(Prisma.sql`(${Prisma.join(disjuncts, " OR ")})`);
  }

  // Count first to preserve existing out-of-range page clamping.
  const countResults = await prisma.$queryRaw<CountResult[]>(Prisma.sql`
    WITH own AS (
      SELECT o."cardId", SUM(o.quantity)::bigint AS qty
      FROM "CardOwnership" o
      WHERE o."userId" = ${f.userId} AND o.quantity > 0
      GROUP BY o."cardId"
    )
    SELECT COUNT(*)::bigint AS total
    FROM own
    JOIN "Card" c ON c.id = own."cardId"
    LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
    LEFT JOIN "Product" p ON p.id = ps."productId"
    WHERE ${Prisma.join(tests, " AND ")}
  `);
  const total = Number(countResults[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / f.pageSize));
  const page = Math.max(1, Math.min(f.page, totalPages));
  const skip = (page - 1) * f.pageSize;

  const raw = await prisma.$queryRaw<PageRow[]>(Prisma.sql`
    WITH own AS (
      SELECT o."cardId", SUM(o.quantity)::bigint AS qty
      FROM "CardOwnership" o
      WHERE o."userId" = ${f.userId} AND o.quantity > 0
      GROUP BY o."cardId"
    )
    SELECT c.id AS "cardId", c.player, c."cardNumber", c.team,
           c."bookValue", own.qty AS "ownedQty",
           c."frontImageUrl", p.year, p.brand, p.sport,
           COALESCE(p.id, ps."productId") AS "productId",
           c."productSetId", ps.name AS "productSetName"
    FROM own
    JOIN "Card" c ON c.id = own."cardId"
    LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
    LEFT JOIN "Product" p ON p.id = ps."productId"
    WHERE ${Prisma.join(tests, " AND ")}
    -- Preserve the existing Analytics sort exactly:
    -- total owned value, then one-copy book value, then player name.
    -- Card ID only stabilizes otherwise identical ties across requests.
    ORDER BY (c."bookValue" * own.qty::float8) DESC,
             c."bookValue" DESC,
             c.player COLLATE "en-US-x-icu" ASC,
             c.id ASC
    LIMIT ${f.pageSize} OFFSET ${skip}
  `);

  const rows = raw.map(c => {
    const ownedQty = Number(c.ownedQty);
    const ownedValue = ownedQty * c.bookValue;
    const productLabel = [c.year, c.brand, c.sport]
      .filter(Boolean).join(" ").trim();
    return {
      cardId: c.cardId,
      player: c.player,
      cardNumber: c.cardNumber,
      team: c.team,
      bookValue: c.bookValue,
      ownedQty,
      ownedValue,
      frontImageUrl: c.frontImageUrl,
      year: c.year,
      brand: c.brand,
      sport: c.sport,
      productId: c.productId,
      productLabel: productLabel || friendlyId(c.productId),
      productSetId: c.productSetId,
      productSetLabel: (c.productSetName ?? "").trim() || friendlyId(c.productSetId),
    };
  });
  return { ok: true, page, pageSize: f.pageSize, total, totalPages, rows };
}
