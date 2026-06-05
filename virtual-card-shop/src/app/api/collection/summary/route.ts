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

function safeQty(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export async function GET() {
  try {
    const user = await requireUser();

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

    const pending = await prisma.gradingOrder.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        status: { in: ["PENDING", "READY"] },
      },
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

    const byProduct = new Map<
      string,
      {
        productId: string;
        totalQty: number;
        totalRawAndGradedQty: number;
        totalPendingGradingQty: number;
        totalValueCents: number;
        uniqueOwnedBaseSet: Set<number>;
        baseSetIds: Set<string>;
      }
    >();

    function getProductAgg(productId: string) {
      let agg = byProduct.get(productId);

      if (!agg) {
        agg = {
          productId,
          totalQty: 0,
          totalRawAndGradedQty: 0,
          totalPendingGradingQty: 0,
          totalValueCents: 0,
          uniqueOwnedBaseSet: new Set<number>(),
          baseSetIds: new Set<string>(),
        };
        byProduct.set(productId, agg);
      }

      return agg;
    }

    for (const r of owned) {
      const qty = safeQty(r.quantity);
      const ps = (r as any).card?.productSet;
      const productId = String(ps?.productId ?? "").trim();
      if (!productId || qty <= 0) continue;

      const bookValueDollars = toNumber((r as any).card?.bookValue);
      const valueCents = Math.round(bookValueDollars * 100) * qty;

      const agg = getProductAgg(productId);

      agg.totalQty += qty;
      agg.totalRawAndGradedQty += qty;
      agg.totalValueCents += valueCents;

      if (ps?.isBase) {
        agg.uniqueOwnedBaseSet.add((r as any).card?.id);
        if (ps?.id) agg.baseSetIds.add(String(ps.id));
      }
    }

    for (const r of pending) {
      const qty = safeQty(r.quantity);
      const ps = (r as any).card?.productSet;
      const productId = String(ps?.productId ?? "").trim();
      if (!productId || qty <= 0) continue;

      const bookValueDollars = toNumber((r as any).card?.bookValue);
      const valueCents = Math.round(bookValueDollars * 100) * qty;

      const agg = getProductAgg(productId);

      // Pending grades count toward total quantity and value so cards do not
      // disappear while out for grading. They stay valued as raw to avoid
      // leaking hidden grades.
      agg.totalQty += qty;
      agg.totalPendingGradingQty += qty;
      agg.totalValueCents += valueCents;

      if (ps?.isBase) {
        agg.uniqueOwnedBaseSet.add((r as any).card?.id);
        if (ps?.id) agg.baseSetIds.add(String(ps.id));
      }
    }

    const productIds = Array.from(byProduct.keys());
    if (productIds.length === 0) return NextResponse.json([]);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        packImageUrl: true,
      },
    });

    const packImageByProduct = new Map<string, string | null>();
    for (const p of products) packImageByProduct.set(p.id, p.packImageUrl ?? null);

    const baseSets = await prisma.productSet.findMany({
      where: { productId: { in: productIds }, isBase: true },
      select: { id: true, productId: true },
    });

    const baseSetIds = baseSets.map((s) => s.id);
    const baseSetIdToProductId = new Map<string, string>();
    for (const s of baseSets) baseSetIdToProductId.set(s.id, s.productId);

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

    const out = productIds.map((pid) => {
      const agg = byProduct.get(pid)!;

      const totalCards = totalCardsByProduct.get(pid) ?? 0;
      const uniqueOwned = agg.uniqueOwnedBaseSet.size;
      const percentComplete = totalCards ? (uniqueOwned / totalCards) * 100 : 0;

      return {
        productId: pid,
        uniqueOwned,

        // Total includes raw + revealed graded + pending grading.
        totalQty: agg.totalQty,

        totalRawAndGradedQty: agg.totalRawAndGradedQty,
        totalPendingGradingQty: agg.totalPendingGradingQty,

        totalCards,
        percentComplete,
        packImageUrl: packImageByProduct.get(pid) ?? null,

        // Pending grades are valued as raw until revealed.
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