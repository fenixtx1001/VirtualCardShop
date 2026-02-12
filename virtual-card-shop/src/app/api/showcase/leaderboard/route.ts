// src/app/api/showcase/leaderboard/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leaderboard across users:
 * - totalCards = SUM(CardOwnership.quantity)
 * - totalValue = SUM(CardOwnership.quantity * Card.bookValue)
 * - completedBaseSets = count of base ProductSets where user owns all unique cards in that base set
 */
export async function GET() {
  try {
    await requireUser();

    const rows = await prisma.$queryRaw<
      Array<{
        userId: string;
        name: string | null;
        email: string | null;
        image: string | null;
        totalCards: number;
        totalValue: number;
        completedBaseSets: number;
      }>
    >`
      WITH totals AS (
        SELECT
          u.id AS "userId",
          u.name,
          u.email,
          u.image,
          COALESCE(SUM(co.quantity), 0)::int AS "totalCards",
          COALESCE(SUM(co.quantity * c."bookValue"), 0)::float AS "totalValue"
        FROM "User" u
        LEFT JOIN "CardOwnership" co
          ON co."userId" = u.id
          AND co.quantity > 0
        LEFT JOIN "Card" c
          ON c.id = co."cardId"
        GROUP BY u.id
      ),
      base_sets AS (
        SELECT
          ps.id AS "productSetId",
          COUNT(*)::int AS "totalCards"
        FROM "ProductSet" ps
        JOIN "Card" c ON c."productSetId" = ps.id
        WHERE ps."isBase" = true
        GROUP BY ps.id
      ),
      user_base_completion AS (
        SELECT
          co."userId" AS "userId",
          c."productSetId" AS "productSetId",
          COUNT(DISTINCT co."cardId")::int AS "uniqueOwned"
        FROM "CardOwnership" co
        JOIN "Card" c ON c.id = co."cardId"
        JOIN "ProductSet" ps ON ps.id = c."productSetId"
        WHERE co.quantity > 0
          AND ps."isBase" = true
        GROUP BY co."userId", c."productSetId"
      ),
      completed AS (
        SELECT
          ubc."userId" AS "userId",
          COUNT(*)::int AS "completedBaseSets"
        FROM user_base_completion ubc
        JOIN base_sets bs ON bs."productSetId" = ubc."productSetId"
        WHERE bs."totalCards" > 0
          AND ubc."uniqueOwned" = bs."totalCards"
        GROUP BY ubc."userId"
      )
      SELECT
        t."userId",
        t.name,
        t.email,
        t.image,
        t."totalCards",
        t."totalValue",
        COALESCE(cmp."completedBaseSets", 0)::int AS "completedBaseSets"
      FROM totals t
      LEFT JOIN completed cmp ON cmp."userId" = t."userId"
      ORDER BY t."totalValue" DESC, t."totalCards" DESC, t.email ASC
    `;

    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
