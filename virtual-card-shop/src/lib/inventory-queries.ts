import { Prisma } from "@prisma/client";

/** One ownership definition for both the summary and the missing-card list.
 * Restrict work to inventory products, including any since removed from the shop.
 * Revealed grading orders already live in CardOwnership and must not count twice.
 */
function progressCTE(userId: string, productIds: string[], productSetId?: string) {
  return Prisma.sql`
    WITH selected_cards AS (
      SELECT c.id AS "cardId", c."cardNumber", c.player, c.team,
        ps.id AS "productSetId", ps."productId", ps.name, ps."isBase"
      FROM "ProductSet" ps JOIN "Card" c ON c."productSetId" = ps.id
      WHERE ps."productId" IN (${Prisma.join(productIds)})
        ${productSetId ? Prisma.sql`AND ps.id = ${productSetId}` : Prisma.empty}
    ), quantities AS (
      SELECT "cardId", SUM(quantity)::int AS qty FROM (
        SELECT o."cardId", o.quantity FROM "CardOwnership" o
        JOIN selected_cards c ON c."cardId" = o."cardId"
        WHERE o."userId" = ${userId} AND o.quantity > 0
        UNION ALL
        SELECT g."cardId", g.quantity FROM "GradingOrder" g
        JOIN selected_cards c ON c."cardId" = g."cardId"
        WHERE g."userId" = ${userId} AND g.quantity > 0 AND g."revealedAt" IS NULL
      ) owned GROUP BY "cardId"
    ), card_quantities AS (
      SELECT c.*, COALESCE(q.qty, 0)::int AS qty
      FROM selected_cards c LEFT JOIN quantities q ON q."cardId" = c."cardId"
    ), levels AS (
      SELECT cq."productSetId", GREATEST(MIN(cq.qty), COALESCE(MAX(p."timesCompleted"), 0))::int AS level
      FROM card_quantities cq
      LEFT JOIN "ProductSetPrestige" p ON p."productSetId" = cq."productSetId" AND p."userId" = ${userId}
      GROUP BY cq."productSetId"
    )`;
}

export function inventoryProgressQuery(userId: string, productIds: string[]) {
  return Prisma.sql`${progressCTE(userId, productIds)}
    SELECT cq."productSetId", cq."productId", cq.name, cq."isBase", l.level,
      (l.level + 1)::int AS "nextLevel", COUNT(*)::int AS "totalCards",
      COUNT(*) FILTER (WHERE cq.qty >= l.level + 1)::int AS "cardsAtNext",
      SUM(GREATEST(0, l.level + 1 - cq.qty))::int AS "missingCopies"
    FROM card_quantities cq JOIN levels l ON l."productSetId" = cq."productSetId"
    GROUP BY cq."productSetId", cq."productId", cq.name, cq."isBase", l.level
    ORDER BY cq."isBase" DESC, cq.name, cq."productSetId"`;
}

export function inventoryMissingQuery(userId: string, productId: string, productSetId: string, offset: number) {
  return Prisma.sql`${progressCTE(userId, [productId], productSetId)}, missing AS (
      SELECT c."cardId", c."cardNumber", c.player, c.team, c.qty AS owned,
        (l.level + 1 - c.qty)::int AS needed
      FROM card_quantities c JOIN levels l ON l."productSetId" = c."productSetId"
      WHERE c.qty < l.level + 1
    )
    SELECT (SELECT COUNT(*)::int FROM missing) AS total,
      (SELECT (level + 1)::int FROM levels LIMIT 1) AS "nextLevel",
      COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM (
        SELECT * FROM missing ORDER BY LENGTH("cardNumber"), "cardNumber", "cardId" LIMIT 50 OFFSET ${offset}
      ) page), '[]'::jsonb) AS rows`;
}
