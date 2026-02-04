import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expected Value per pack (book value dollars), matching your rip/open logic:
 * - X cards per pack
 * - Each insert set is an independent 1-in-N roll
 * - Each hit adds 1 insert card and replaces 1 base card
 *
 * EV(pack) = X * B + Σ p_i * (I_i - B)
 * where:
 *  B = avg base bookValue
 *  I_i = avg insert bookValue for set i (if set has no cards, treat as base)
 *  p_i = 1 / oddsPerPack_i
 */

function num(v: any): number {
  if (v == null) return 0;
  // Prisma Decimal can come back as string in some setups
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  // friends-only admin tool: require signed-in user
  await requireUser();

  const url = new URL(req.url);
  const productId = (url.searchParams.get("productId") ?? "").trim();

  // Load products + their productSets
  const products = await prisma.product.findMany({
    where: productId ? { id: productId } : undefined,
    select: {
      id: true,
      cardsPerPack: true,
      packPriceCents: true,
      released: true,
      productSets: {
        select: {
          id: true,
          isBase: true,
          oddsPerPack: true,
        },
      },
    },
  });

  if (productId && products.length === 0) {
    return NextResponse.json({ ok: false, error: `Product not found: ${productId}` }, { status: 404 });
  }

  // Gather all relevant productSetIds for a single groupBy
  const setIds: string[] = [];
  for (const p of products) {
    for (const ps of p.productSets) setIds.push(ps.id);
  }

  if (setIds.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // One query to get avg/count bookValue for every productSet involved
  // (Fast and updates immediately when bookValue changes)
  const bySet = await prisma.card.groupBy({
    by: ["productSetId"],
    where: { productSetId: { in: setIds } },
    _avg: { bookValue: true },
    _count: { _all: true },
  });

  const setStats = new Map<
    string,
    { avg: number; count: number }
  >();
  for (const row of bySet) {
    const sid = row.productSetId ?? "";
    setStats.set(sid, {
      avg: num((row as any)._avg?.bookValue),
      count: num((row as any)._count?._all),
    });
  }

  const items = products.map((p) => {
    const X = typeof p.cardsPerPack === "number" && p.cardsPerPack > 0 ? p.cardsPerPack : 15;

    const baseSets = p.productSets.filter((ps) => ps.isBase);
    const insertSets = p.productSets.filter((ps) => !ps.isBase && (ps.oddsPerPack ?? 0) > 0);

    // If multiple base sets exist, we treat the base pool as the combined pool.
    // We compute B as the weighted average across base sets (by card count).
    let baseCountTotal = 0;
    let baseValueTotal = 0;

    for (const bs of baseSets) {
      const st = setStats.get(bs.id) ?? { avg: 0, count: 0 };
      baseCountTotal += st.count;
      baseValueTotal += st.avg * st.count;
    }

    const B = baseCountTotal > 0 ? baseValueTotal / baseCountTotal : 0;

    // EV starts as X * B (all base)
    let ev = X * B;

    // Add insert adjustments: p_i * (I_i - B)
    let expectedInserts = 0;

    const insertBreakdown = insertSets.map((ins) => {
      const n = ins.oddsPerPack ?? 0;
      const pHit = n > 0 ? 1 / n : 0;

      const st = setStats.get(ins.id) ?? { avg: 0, count: 0 };

      // If the insert set has no cards, your rip/open logic effectively backfills base,
      // so treat its "insert avg" as base avg (no EV change from this insert).
      const I = st.count > 0 ? st.avg : B;

      expectedInserts += pHit;
      ev += pHit * (I - B);

      return {
        productSetId: ins.id,
        oddsPerPack: n,
        pHit,
        avgInsertValue: I,
        insertCardCount: st.count,
      };
    });

    const packPriceCents = p.packPriceCents ?? 0;
    const packPriceDollars = packPriceCents / 100;

    return {
      productId: p.id,
      released: p.released,
      cardsPerPack: X,
      avgBaseValue: B,
      expectedInsertsPerPack: expectedInserts,
      evPerPack: ev, // book-value dollars
      packPriceDollars,
      evPerDollar: packPriceDollars > 0 ? ev / packPriceDollars : null,
      inserts: insertBreakdown,
    };
  });

  return NextResponse.json({ ok: true, items });
}
