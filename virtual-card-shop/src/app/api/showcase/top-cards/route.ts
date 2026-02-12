// src/app/api/showcase/top-cards/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Top cards by SINGLE-card value (bookValue), not multiplied by quantity.
 * Still returns qty owned for display.
 *
 * Query:
 * - userId (optional) defaults to current user
 * - page (optional) default 1
 * - pageSize (optional) default 20 (max 50)
 * - maxTotal is capped at 100 cards
 *
 * Insert label:
 * - If insert, API returns productSetName (ps.name fallback ps.id)
 */
export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const url = new URL(req.url);

    const userId = (url.searchParams.get("userId") ?? "").trim() || me.id;

    const page = clampInt(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1, 9999);
    const pageSize = clampInt(parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 5, 50);

    const maxTotal = 100;
    const offset = (page - 1) * pageSize;

    const totalRow = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS total
      FROM "CardOwnership" co
      JOIN "Card" c ON c.id = co."cardId"
      WHERE co."userId" = ${userId}
        AND co.quantity > 0
        AND c."bookValue" IS NOT NULL
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

        bookValue: number;
        qty: number;
        ownedValue: number; // single-card value (same as bookValue)

        frontImageUrl: string | null;
      }>
    >`
      SELECT
        c.id AS "cardId",
        c."cardNumber" AS "cardNumber",
        c.player AS "player",
        c.team AS "team",
        c.subset AS "subset",
        c.variant AS "variant",

        ps."isInsert" AS "isInsert",
        c."productSetId" AS "productSetId",
        COALESCE(NULLIF(TRIM(ps.name), ''), ps.id) AS "productSetName",

        c."bookValue"::float AS "bookValue",
        co.quantity::int AS "qty",
        c."bookValue"::float AS "ownedValue",

        c."frontImageUrl" AS "frontImageUrl"
      FROM "CardOwnership" co
      JOIN "Card" c ON c.id = co."cardId"
      LEFT JOIN "ProductSet" ps ON ps.id = c."productSetId"
      WHERE co."userId" = ${userId}
        AND co.quantity > 0
        AND c."bookValue" IS NOT NULL
      ORDER BY c."bookValue" DESC, co.quantity DESC, c.id DESC
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
