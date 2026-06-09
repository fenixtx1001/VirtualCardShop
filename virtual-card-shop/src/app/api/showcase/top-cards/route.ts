import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const url = new URL(req.url);

    const userId = (url.searchParams.get("userId") ?? "").trim() || me.id;

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 9999);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 5, 50);

    const maxTotal = 100;

    const totalRow = await prisma.$queryRaw<Array<{ total: number }>>`
      WITH card_buckets AS (
        SELECT
          co."cardId",
          co.grade,
          SUM(co.quantity)::int AS qty
        FROM "CardOwnership" co
        JOIN "Card" c ON c.id = co."cardId"
        WHERE co."userId" = ${userId}
          AND co.quantity > 0
          AND c."bookValue" IS NOT NULL
        GROUP BY co."cardId", co.grade

        UNION ALL

        SELECT
          go."cardId",
          0 AS grade,
          SUM(go.quantity)::int AS qty
        FROM "GradingOrder" go
        JOIN "Card" c ON c.id = go."cardId"
        WHERE go."userId" = ${userId}
          AND go.status IN ('PENDING', 'READY')
          AND go.quantity > 0
          AND c."bookValue" IS NOT NULL
        GROUP BY go."cardId"
      ),
      merged_buckets AS (
        SELECT
          "cardId",
          grade,
          SUM(qty)::int AS qty
        FROM card_buckets
        GROUP BY "cardId", grade
      )
      SELECT COUNT(*)::int AS total
      FROM merged_buckets
      WHERE qty > 0
    `;

    const totalAll = totalRow?.[0]?.total ?? 0;
    const total = Math.min(totalAll, maxTotal);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const safeOffset = (safePage - 1) * pageSize;

    const rows = await prisma.$queryRaw<
      Array<{
        cardId: number;
        cardNumber: string;
        player: string;
        team: string | null;
        subset: string | null;
        variant: string | null;

        isInsert: boolean;
        productSetId: string | null;
        productSetName: string | null;

        grade: number;
        gradeLabel: string;
        bookValue: number;
        qty: number;
        ownedValue: number;

        frontImageUrl: string | null;
      }>
    >`
      WITH card_buckets AS (
        SELECT
          co."cardId",
          co.grade,
          SUM(co.quantity)::int AS qty
        FROM "CardOwnership" co
        JOIN "Card" c ON c.id = co."cardId"
        WHERE co."userId" = ${userId}
          AND co.quantity > 0
          AND c."bookValue" IS NOT NULL
        GROUP BY co."cardId", co.grade

        UNION ALL

        SELECT
          go."cardId",
          0 AS grade,
          SUM(go.quantity)::int AS qty
        FROM "GradingOrder" go
        JOIN "Card" c ON c.id = go."cardId"
        WHERE go."userId" = ${userId}
          AND go.status IN ('PENDING', 'READY')
          AND go.quantity > 0
          AND c."bookValue" IS NOT NULL
        GROUP BY go."cardId"
      ),
      merged_buckets AS (
        SELECT
          "cardId",
          grade,
          SUM(qty)::int AS qty
        FROM card_buckets
        GROUP BY "cardId", grade
      )
      SELECT
        c.id AS "cardId",
        c."cardNumber" AS "cardNumber",
        c.player AS "player",
        c.team AS "team",
        c.subset AS "subset",
        c.variant AS "variant",

        COALESCE(ps."isInsert", false) AS "isInsert",
        c."productSetId" AS "productSetId",
        COALESCE(NULLIF(TRIM(ps.name), ''), ps.id) AS "productSetName",

        mb.grade::int AS "grade",
        CASE
          WHEN mb.grade = 0 THEN 'Raw'
          ELSE CONCAT('VCS ', mb.grade)
        END AS "gradeLabel",

        c."bookValue"::float AS "bookValue",
        mb.qty::int AS "qty",

        (
          c."bookValue" *
          CASE mb.grade
            WHEN 6 THEN 0.8
            WHEN 7 THEN 1.05
            WHEN 8 THEN 1.45
            WHEN 9 THEN 2.6
            WHEN 10 THEN 15.0
            ELSE 1.0
          END
        )::float AS "ownedValue",

        c."frontImageUrl" AS "frontImageUrl"
      FROM merged_buckets mb
      JOIN "Card" c ON c.id = mb."cardId"
      LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
      WHERE mb.qty > 0
      ORDER BY "ownedValue" DESC, mb.qty DESC, c.id DESC
      LIMIT ${Math.min(pageSize, maxTotal)}
      OFFSET ${Math.min(safeOffset, maxTotal)}
    `;

    return NextResponse.json(
      {
        ok: true,
        page: safePage,
        pageSize,
        total,
        totalPages,
        rows,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load top cards" },
      { status: 500 }
    );
  }
}