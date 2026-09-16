import { prisma } from "@/lib/prisma";
import { summarizeProgress, type SetProgress } from "./discovery";

/** Aggregate inside Postgres: no per-product queries and no card payload in the browser. */
export async function getShopProgress(userId: string) {
  const sets = await prisma.$queryRaw<SetProgress[]>`
    WITH quantities AS (
      SELECT "cardId", SUM(quantity)::int AS qty FROM (
        SELECT "cardId", quantity FROM "CardOwnership" WHERE "userId" = ${userId} AND quantity > 0
        UNION ALL
        SELECT "cardId", quantity FROM "GradingOrder" WHERE "userId" = ${userId} AND quantity > 0 AND "revealedAt" IS NULL
      ) owned GROUP BY "cardId"
    ), card_quantities AS (
      SELECT ps.id AS "productSetId", ps."productId", ps.name, ps."isBase", COALESCE(q.qty, 0) AS qty
      FROM "ProductSet" ps
      JOIN "Product" p ON p.id = ps."productId" AND p.released = true
      JOIN "Card" c ON c."productSetId" = ps.id
      LEFT JOIN quantities q ON q."cardId" = c.id
    ), levels AS (
      SELECT cq."productSetId", GREATEST(MIN(cq.qty), COALESCE(MAX(pr."timesCompleted"), 0))::int AS level
      FROM card_quantities cq
      LEFT JOIN "ProductSetPrestige" pr ON pr."productSetId" = cq."productSetId" AND pr."userId" = ${userId}
      GROUP BY cq."productSetId"
    )
    SELECT cq."productSetId", cq."productId", cq.name, cq."isBase", l.level, (l.level + 1)::int AS "nextLevel",
      COUNT(*)::int AS "totalCards", COUNT(*) FILTER (WHERE cq.qty > 0)::int AS "ownedCards",
      COUNT(*) FILTER (WHERE cq.qty >= l.level + 1)::int AS "cardsAtNext",
      SUM(GREATEST(0, l.level + 1 - cq.qty))::int AS "missingCopies"
    FROM card_quantities cq JOIN levels l ON l."productSetId" = cq."productSetId"
    GROUP BY cq."productSetId", cq."productId", cq.name, cq."isBase", l.level
  `;
  return summarizeProgress(sets);
}
