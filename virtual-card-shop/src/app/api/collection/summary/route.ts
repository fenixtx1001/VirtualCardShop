// src/app/api/collection/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Decimal.js-like (Prisma Decimal)
  if (typeof v === "object" && typeof v.toNumber === "function") {
    try {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export async function GET() {
  try {
    const user = await requireUser();

    // Pull ALL ownerships for the user (qty > 0), including card -> productSet -> productId.
    const owned = await prisma.cardOwnership.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      select: {
        quantity: true,
        card: {
          select: {
            id: true,
            bookValue: true,
            productSet: {
              select: {
                id: true,
                productId: true,
                isBase: true,
              },
            },
          },
        },
      },
    });

    // Aggregate per productId:
    // - totalQty (all owned cards within product)
    // - totalValueCents (all owned cards within product)
    // - uniqueOwned (BASE only, for completion)
    // - baseSetIds (to compute totalCards in base)
    const byProduct = new Map<
      string,
      {
        productId: string;
        totalQty: number;
        totalValueCents: number;
        uniqueOwnedBaseSet: Set<number>;
        baseSetIds: Set<string>;
      }
    >();

    for (const r of owned) {
      const qty = typeof r.quantity === "number" ? r.quantity : 0;
      const ps = (r as any).card?.productSet;
      const productId = String(ps?.productId ?? "").trim();
      if (!productId) continue;

      const bookValueDollars = toNumber((r as any).card?.bookValue); // stored in dollars
      const valueCents = Math.round(bookValueDollars * 100) * qty;

      let agg = byProduct.get(productId);
      if (!agg) {
        agg = {
          productId,
          totalQty: 0,
          totalValueCents: 0,
          uniqueOwnedBaseSet: new Set<number>(),
          baseSetIds: new Set<string>(),
        };
        byProduct.set(productId, agg);
      }

      agg.totalQty += qty;
      agg.totalValueCents += valueCents;

      // For completion stats, we only count BASE set cards
      if (ps?.isBase) {
        agg.uniqueOwnedBaseSet.add((r as any).card?.id);
        if (ps?.id) agg.baseSetIds.add(String(ps.id));
      }
    }

    const productIds = Array.from(byProduct.keys());
    if (productIds.length === 0) return NextResponse.json([]);

    // Load product metadata for images
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        packImageUrl: true,
      },
    });

    const packImageByProduct = new Map<string, string | null>();
    for (const p of products) packImageByProduct.set(p.id, p.packImageUrl ?? null);

    // Compute totalCards for BASE sets per product:
    // 1) find base productSets for these products
    const baseSets = await prisma.productSet.findMany({
      where: { productId: { in: productIds }, isBase: true },
      select: { id: true, productId: true },
    });

    const baseSetIds = baseSets.map((s) => s.id);
    const baseSetIdToProductId = new Map<string, string>();
    for (const s of baseSets) baseSetIdToProductId.set(s.id, s.productId);

    // 2) count cards grouped by base productSetId
    const counts = baseSetIds.length
      ? await prisma.card.groupBy({
          by: ["productSetId"],
          where: { productSetId: { in: baseSetIds } },
          _count: { _all: true },
        })
      : [];

    const totalCardsByProduct = new Map<string, number>();
    for (const c of counts) {
      const psid = c.productSetId as string;
      const pid = baseSetIdToProductId.get(psid);
      if (!pid) continue;
      totalCardsByProduct.set(pid, (totalCardsByProduct.get(pid) ?? 0) + (c._count?._all ?? 0));
    }

    // Build response (array)
    const out = productIds.map((pid) => {
      const agg = byProduct.get(pid)!;

      const totalCards = totalCardsByProduct.get(pid) ?? 0;
      const uniqueOwned = agg.uniqueOwnedBaseSet.size;
      const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

      return {
        productId: pid,
        uniqueOwned,
        totalQty: agg.totalQty,
        totalCards,
        percentComplete,
        packImageUrl: packImageByProduct.get(pid) ?? null,

        // ✅ NEW
        totalValueCents: agg.totalValueCents,
      };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load collection summary" },
      { status: 500 }
    );
  }
}
