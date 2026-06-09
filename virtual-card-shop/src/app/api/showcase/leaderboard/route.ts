import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      WITH ownership_totals AS (
        SELECT
          co."userId",
          COALESCE(SUM(co.quantity), 0)::int AS "totalCards",
          COALESCE(
            SUM(
              co.quantity *
              (
                COALESCE(c."bookValue", 0) *
                CASE co.grade
                  WHEN 6 THEN 0.8
                  WHEN 7 THEN 1.05
                  WHEN 8 THEN 1.45
                  WHEN 9 THEN 2.6
                  WHEN 10 THEN 15.0
                  ELSE 1.0
                END
              )
            ),
            0
          )::float AS "totalValue"
        FROM "CardOwnership" co
        JOIN "Card" c ON c.id = co."cardId"
        WHERE co.quantity > 0
        GROUP BY co."userId"
      ),
      pending_totals AS (
        SELECT
          go."userId",
          COALESCE(SUM(go.quantity), 0)::int AS "totalCards",
          COALESCE(SUM(go.quantity * COALESCE(c."bookValue", 0)), 0)::float AS "totalValue"
        FROM "GradingOrder" go
        JOIN "Card" c ON c.id = go."cardId"
        WHERE go.status IN ('PENDING', 'READY')
          AND go.quantity > 0
        GROUP BY go."userId"
      ),
      totals AS (
        SELECT
          u.id AS "userId",
          u.name,
          u.email,
          u.image,
          (
            COALESCE(ot."totalCards", 0) +
            COALESCE(pt."totalCards", 0)
          )::int AS "totalCards",
          (
            COALESCE(ot."totalValue", 0) +
            COALESCE(pt."totalValue", 0)
          )::float AS "totalValue"
        FROM "User" u
        LEFT JOIN ownership_totals ot ON ot."userId" = u.id
        LEFT JOIN pending_totals pt ON pt."userId" = u.id
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
      ownership_card_presence AS (
        SELECT DISTINCT
          co."userId",
          co."cardId"
        FROM "CardOwnership" co
        WHERE co.quantity > 0
      ),
      pending_card_presence AS (
        SELECT DISTINCT
          go."userId",
          go."cardId"
        FROM "GradingOrder" go
        WHERE go.status IN ('PENDING', 'READY')
          AND go.quantity > 0
      ),
      all_card_presence AS (
        SELECT * FROM ownership_card_presence
        UNION
        SELECT * FROM pending_card_presence
      ),
      user_base_completion AS (
        SELECT
          acp."userId" AS "userId",
          c."productSetId" AS "productSetId",
          COUNT(DISTINCT acp."cardId")::int AS "uniqueOwned"
        FROM all_card_presence acp
        JOIN "Card" c ON c.id = acp."cardId"
        JOIN "ProductSet" ps ON ps.id = c."productSetId"
        WHERE ps."isBase" = true
        GROUP BY acp."userId", c."productSetId"
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