// src/app/sets/[setId]/cards/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function getParams(ctx: any) {
  const p: any = ctx?.params;
  const params = typeof p?.then === "function" ? await p : p;

  const setId = typeof params?.setId === "string" ? decodeURIComponent(params.setId) : "";
  return { setId };
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    const { setId } = await getParams(ctx);

    if (!setId || setId === "undefined") {
      return NextResponse.json({ error: "Missing setId in route params" }, { status: 400 });
    }

    const url = new URL(req.url);
    const page = clampInt(Number(url.searchParams.get("page") ?? "1"), 1, 999999);
    const pageSize = clampInt(Number(url.searchParams.get("pageSize") ?? "100"), 1, 500);

    // Count first (for pagination)
    const totalCards = await prisma.card.count({
      where: { setId },
    });

    const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
    const safePage = clampInt(page, 1, totalPages);
    const skip = (safePage - 1) * pageSize;

    // Numeric-ish ordering for cardNumber (handles "10" vs "2")
    const cards = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        setId,
        productSetId,
        cardNumber,
        player,
        team,
        position,
        subset,
        variant,
        quantityOwned,
        bookValue,
        frontImageUrl,
        backImageUrl
      FROM Card
      WHERE setId = ${setId}
      ORDER BY
        CAST(trim(cardNumber) AS INTEGER) ASC,
        trim(cardNumber) ASC,
        id ASC
      LIMIT ${pageSize} OFFSET ${skip};
    `;

    return NextResponse.json({
      ok: true,
      setId,
      cards,
      pagination: {
        page: safePage,
        pageSize,
        totalCards,
        totalPages,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load cards" }, { status: 500 });
  }
}
