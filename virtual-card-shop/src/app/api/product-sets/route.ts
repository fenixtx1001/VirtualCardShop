export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 1) Load product sets (lightweight)
    const productSets = await prisma.productSet.findMany({
      select: {
        id: true,
        productId: true,
        name: true,
        isBase: true,
        isInsert: true,
        oddsPerPack: true,
        _count: { select: { cards: true } },
      },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    });

    if (!productSets.length) return NextResponse.json([]);

    // 2) Compute conditional counts per productSetId (Postgres-safe)
    const statsRows = await prisma.$queryRaw<
      Array<{
        productSetId: string;
        totalCards: number;
        pricedCards: number;
        frontCards: number;
        backCards: number;
      }>
    >`
      SELECT
        "productSetId" as "productSetId",
        COUNT(*)::int as "totalCards",
        COALESCE(SUM(CASE WHEN "bookValue" IS NOT NULL AND "bookValue" > 0 THEN 1 ELSE 0 END), 0)::int as "pricedCards",
        COALESCE(SUM(CASE WHEN "frontImageUrl" IS NOT NULL AND TRIM("frontImageUrl") <> '' THEN 1 ELSE 0 END), 0)::int as "frontCards",
        COALESCE(SUM(CASE WHEN "backImageUrl" IS NOT NULL AND TRIM("backImageUrl") <> '' THEN 1 ELSE 0 END), 0)::int as "backCards"
      FROM "Card"
      WHERE "productSetId" IS NOT NULL
      GROUP BY "productSetId";
    `;

    const statsBySetId = new Map<
      string,
      { totalCards: number; pricedCards: number; frontCards: number; backCards: number }
    >();

    for (const r of statsRows) {
      statsBySetId.set(String(r.productSetId), {
        totalCards: Number(r.totalCards ?? 0),
        pricedCards: Number(r.pricedCards ?? 0),
        frontCards: Number(r.frontCards ?? 0),
        backCards: Number(r.backCards ?? 0),
      });
    }

    const withStats = productSets.map((ps) => {
      const s = statsBySetId.get(ps.id) ?? {
        totalCards: ps._count?.cards ?? 0,
        pricedCards: 0,
        frontCards: 0,
        backCards: 0,
      };

      const total = Number(s.totalCards ?? 0);
      const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0); // 1 decimal

      return {
        ...ps,
        stats: {
          totalCards: total,
          pricedCards: s.pricedCards,
          frontCards: s.frontCards,
          backCards: s.backCards,
          pctPriced: pct(s.pricedCards),
          pctFront: pct(s.frontCards),
          pctBack: pct(s.backCards),
        },
      };
    });

    return NextResponse.json(withStats);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load product sets" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : null;

    if (!id) return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    if (!productId)
      return NextResponse.json({ error: "Missing required field: productId" }, { status: 400 });

    const isBase = !!body?.isBase;
    const isInsert = !!body?.isInsert;

    if (isBase && isInsert) {
      return NextResponse.json(
        { error: "A Product Set cannot be both Base and Insert." },
        { status: 400 }
      );
    }

    const oddsPerPack =
      body?.oddsPerPack === null || body?.oddsPerPack === undefined || body?.oddsPerPack === ""
        ? null
        : Number(body.oddsPerPack);

    if (oddsPerPack !== null && !Number.isFinite(oddsPerPack)) {
      return NextResponse.json({ error: "oddsPerPack must be a number or null." }, { status: 400 });
    }

    const created = await prisma.productSet.create({
      data: {
        id,
        productId,
        name,
        isBase,
        isInsert,
        oddsPerPack,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to create product set" },
      { status: 500 }
    );
  }
}
