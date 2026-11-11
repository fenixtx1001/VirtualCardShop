import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Aggregate summary reports inside Postgres, without loading every card,
 * owned copy and product relation into a Vercel function.
 *
 * Player grouping intentionally keeps the legacy path: player suffix and
 * ignore-token normalization is user-configurable and must remain identical.
 *
 * All SQL expressions are hardcoded and user filters are bound parameters.
 */
export type AggregateGroup = "team" | "product" | "product_set" | "brand" | "year" | "sport";
export type AggregateScope = "me" | "all_users" | "single_user";
export type AggregateUniverse = "owned" | "all";

export type AggregateRow = {
  key: string;
  label: string;
  uniqueCards: number;
  ownedQty: number;
  ownedValue: number;
  totalBookValue: number;
  maxBookValue: number;
  topCardLabel: string;
};

export type AggregateFilters = {
  scope: AggregateScope;
  universe: AggregateUniverse;
  targetUserId: string | null;
  groupBy: AggregateGroup;
  search: string;
  player: string;
  team: string;
  year: string;
  brand: string;
  sport: string;
  productId: string;
  productSetId: string;
};

type RawRow = {
  group_key: string | null;
  group_label: string | null;
  unique_cards: bigint;
  owned_qty: bigint | null;
  owned_value: number | null;
  total_book_value: number | null;
  max_book_value: number | null;
  top_card_label: string | null;
};

function friendlyId(value: string) {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim() || "—";
}

/** Prisma 'contains' treats literal % and _ as characters, not wildcards. */
function containsPattern(value: string) {
  return "%" + value.replace(/[\\%_]/g, "\\$&") + "%";
}

export async function aggregateSummaryRows(f: AggregateFilters): Promise<AggregateRow[]> {
  const expr: Record<AggregateGroup, { key: Prisma.Sql; label: Prisma.Sql }> = {
    team: {
      key: Prisma.sql`COALESCE(NULLIF(c.team, ''), '—')`,
      label: Prisma.sql`COALESCE(NULLIF(c.team, ''), '—')`,
    },
    product: {
      key: Prisma.sql`COALESCE(p.id, ps."productId", '—')`,
      label: Prisma.sql`COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', NULLIF(p.year, 0), NULLIF(p.brand, ''), NULLIF(p.sport, ''))), ''),
        COALESCE(p.id, ps."productId", '—'))`,
    },
    product_set: {
      key: Prisma.sql`COALESCE(c."productSetId", '—')`,
      label: Prisma.sql`COALESCE(NULLIF(TRIM(ps.name), ''), c."productSetId", '—')`,
    },
    brand: {
      key: Prisma.sql`COALESCE(NULLIF(p.brand, ''), '—')`,
      label: Prisma.sql`COALESCE(NULLIF(p.brand, ''), '—')`,
    },
    year: {
      key: Prisma.sql`COALESCE(p.year::text, '—')`,
      label: Prisma.sql`COALESCE(p.year::text, '—')`,
    },
    sport: {
      key: Prisma.sql`COALESCE(NULLIF(p.sport, ''), '—')`,
      label: Prisma.sql`COALESCE(NULLIF(p.sport, ''), '—')`,
    },
  };
  const group = expr[f.groupBy];

  // One scoped aggregation instead of per-card ownership subqueries.
  const ownFilter = f.scope !== "all_users" && f.targetUserId
    ? Prisma.sql`AND o."userId" = ${f.targetUserId}`
    : Prisma.empty;

  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.player) conditions.push(Prisma.sql`c.player ILIKE ${containsPattern(f.player)} ESCAPE '\\'`);
  if (f.team) conditions.push(Prisma.sql`c.team ILIKE ${containsPattern(f.team)} ESCAPE '\\'`);
  if (f.productSetId) conditions.push(Prisma.sql`c."productSetId" = ${f.productSetId}`);
  if (f.productId) conditions.push(Prisma.sql`ps."productId" = ${f.productId}`);
  if (f.sport) conditions.push(Prisma.sql`p.sport = ${f.sport}`);
  if (f.brand) conditions.push(Prisma.sql`p.brand = ${f.brand}`);
  if (f.year) {
    const year = parseInt(f.year, 10);
    if (Number.isFinite(year)) conditions.push(Prisma.sql`p.year = ${year}`);
  }
  if (f.search) {
    const term = containsPattern(f.search);
    const searchYear = parseInt(f.search, 10);
    const terms = [
      Prisma.sql`c.player ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`c.team ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`c."cardNumber" ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`c."productSetId" ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`ps.name ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`p.id ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`p.brand ILIKE ${term} ESCAPE '\\'`,
      Prisma.sql`p.sport ILIKE ${term} ESCAPE '\\'`,
    ];
    if (Number.isFinite(searchYear)) terms.push(Prisma.sql`p.year = ${searchYear}`);
    conditions.push(Prisma.sql`(${Prisma.join(terms, " OR ")})`);
  }
  if (f.universe === "owned" && (f.scope === "all_users" || f.targetUserId)) {
    conditions.push(Prisma.sql`COALESCE(own.qty, 0) > 0`);
  }

  const data = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH own AS (
      SELECT o."cardId", SUM(o.quantity)::bigint AS qty
      FROM "CardOwnership" o
      WHERE o.quantity > 0 ${ownFilter}
      GROUP BY o."cardId"
    )
    SELECT
      ${group.key} AS group_key,
      ${group.label} AS group_label,
      COUNT(*)::bigint AS unique_cards,
      COALESCE(SUM(own.qty), 0)::bigint AS owned_qty,
      COALESCE(SUM(COALESCE(own.qty, 0)::float8 * c."bookValue"), 0)::float8 AS owned_value,
      COALESCE(SUM(c."bookValue"), 0)::float8 AS total_book_value,
      COALESCE(MAX(c."bookValue"), 0)::float8 AS max_book_value,
      (ARRAY_AGG(c.player ||
        CASE WHEN c."cardNumber" <> '' THEN ' #' || c."cardNumber" ELSE '' END
        ORDER BY c."bookValue" DESC, c.id ASC))[1] AS top_card_label
    FROM "Card" c
    LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
    LEFT JOIN "Product" p ON p.id = ps."productId"
    LEFT JOIN own ON own."cardId" = c.id
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY ${group.key}, ${group.label}
  `);

  return data.map(row => {
    const key = row.group_key || "—";
    const label = row.group_label || "—";
    const needsFriendly = (f.groupBy === "product" || f.groupBy === "product_set") &&
      key === label;
    return {
      key,
      label: needsFriendly ? friendlyId(label) : label,
      uniqueCards: Number(row.unique_cards ?? 0),
      ownedQty: Number(row.owned_qty ?? 0),
      ownedValue: Number(row.owned_value ?? 0),
      totalBookValue: Number(row.total_book_value ?? 0),
      maxBookValue: Number(row.max_book_value ?? 0),
      topCardLabel: row.top_card_label || "—",
    };
  });
}
