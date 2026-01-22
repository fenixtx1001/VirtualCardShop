import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/default-user";

export async function GET() {
  try {
    const user = await getOrCreateDefaultUser();

    // Find all card ownerships, bring along card -> productSet -> product
    const owned = await prisma.cardOwnership.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        card: { productSetId: { not: null } },
      },
      select: {
        quantity: true,
        card: {
          select: {
            id: true,
            productSet: {
              select: {
                // NOTE: include productSetId in select so TS knows it's present
                id: true,
                product: {
                  select: {
                    id: true,
                    packImageUrl: true,
                    boxImageUrl: true,
                    packPriceCents: true,
                    cardsPerPack: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aggregate owned unique cards by productId
    const ownedByProduct = new Map<
      string,
      {
        productId: string;
        uniqueOwned: number;
        totalQty: number;
        packImageUrl: string | null;
      }
    >();

    for (const o of owned) {
      const ps = o.card.productSet;
      if (!ps) continue; // TS + runtime safety (relation can still be null in types)

      const p = ps.product;
      const key = p.id;

      const cur =
        ownedByProduct.get(key) ?? {
          productId: key,
          uniqueOwned: 0,
          totalQty: 0,
          packImageUrl: p.packImageUrl ?? null,
        };

      cur.uniqueOwned += 1;
      cur.totalQty += o.quantity;
      if (!cur.packImageUrl && p.packImageUrl) cur.packImageUrl = p.packImageUrl;

      ownedByProduct.set(key, cur);
    }

    const productIds = [...ownedByProduct.keys()];
    if (productIds.length === 0) return NextResponse.json([]);

    /**
     * Total cards per product
     * We group by productSetId (because Card stores productSetId),
     * then roll those totals up to productId using ProductSet metadata.
     */
    const totalsBySet = await prisma.card.groupBy({
      by: ["productSetId"],
      _count: { _all: true },
      where: {
        productSet: {
          productId: { in: productIds },
        },
      },
    });

    const sets = await prisma.productSet.findMany({
      where: { productId: { in: productIds } },
      select: { id: true, productId: true, isBase: true },
    });

    const productBySetId = new Map<string, { productId: string; isBase: boolean }>();
    for (const s of sets) {
      productBySetId.set(s.id, { productId: s.productId, isBase: s.isBase });
    }

    const totalByProduct = new Map<string, { totalAll: number; totalBase: number }>();
    for (const t of totalsBySet) {
      // productSetId is nullable in schema, so TS requires a guard
      const setId = t.productSetId;
      if (!setId) continue;

      const meta = productBySetId.get(setId);
      if (!meta) continue;

      const cur = totalByProduct.get(meta.productId) ?? { totalAll: 0, totalBase: 0 };
      cur.totalAll += t._count._all;
      if (meta.isBase) cur.totalBase += t._count._all;
      totalByProduct.set(meta.productId, cur);
    }

    const out = productIds
      .map((pid) => {
        const ownedAgg = ownedByProduct.get(pid)!;
        const totalsAgg = totalByProduct.get(pid) ?? { totalAll: 0, totalBase: 0 };

        const total = totalsAgg.totalAll;
        const pct = total > 0 ? Math.round((ownedAgg.uniqueOwned / total) * 1000) / 10 : 0; // 1 decimal

        return {
          productId: pid,
          uniqueOwned: ownedAgg.uniqueOwned,
          totalCards: total,
          percentComplete: pct,
          packImageUrl: ownedAgg.packImageUrl,
          totalQty: ownedAgg.totalQty,
        };
      })
      .sort((a, b) => a.productId.localeCompare(b.productId));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load collection summary" },
      { status: 500 }
    );
  }
}
