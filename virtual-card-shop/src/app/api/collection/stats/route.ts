import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const rows = await prisma.$queryRaw<
      Array<{
        cardsOwned: number;
        collectionValueCents: number;
      }>
    >`
      WITH ownership_values AS (
        SELECT
          COALESCE(SUM(co.quantity), 0)::int AS "cardsOwned",
          COALESCE(
            SUM(
              co.quantity *
              ROUND(
                (COALESCE(c."bookValue", 0) * 100) *
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
          )::int AS "collectionValueCents"
        FROM "CardOwnership" co
        JOIN "Card" c ON c.id = co."cardId"
        WHERE co."userId" = ${user.id}
          AND co.quantity > 0
      ),
      pending_values AS (
        SELECT
          COALESCE(SUM(go.quantity), 0)::int AS "cardsOwned",
          COALESCE(
            SUM(go.quantity * ROUND(COALESCE(c."bookValue", 0) * 100)),
            0
          )::int AS "collectionValueCents"
        FROM "GradingOrder" go
        JOIN "Card" c ON c.id = go."cardId"
        WHERE go."userId" = ${user.id}
          AND go.status IN ('PENDING', 'READY')
          AND go.quantity > 0
      )
      SELECT
        (ownership_values."cardsOwned" + pending_values."cardsOwned")::int AS "cardsOwned",
        (ownership_values."collectionValueCents" + pending_values."collectionValueCents")::int AS "collectionValueCents"
      FROM ownership_values, pending_values
    `;

    return NextResponse.json({
      ok: true,
      cardsOwned: rows[0]?.cardsOwned ?? 0,
      collectionValueCents: rows[0]?.collectionValueCents ?? 0,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status });
  }
}