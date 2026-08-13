import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { automaticPackPriceCents } from "@/lib/pack-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expected value per pack:
 *
 * EV(pack) = X * B + Σ p_i * (I_i - B)
 *
 * X   = cards per pack
 * B   = average base-card book value
 * I_i = average value of insert set i
 * p_i = probability of pulling insert set i
 *
 * Automatic pack pricing:
 *
 * Pack price = EV per pack / 2.00
 *
 * The resulting price is rounded to the nearest $0.05.
 */

function num(v: unknown): number {
  if (v == null) return 0;

  const n =
    typeof v === "number"
      ? v
      : Number(v);

  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  await requireUser();

  const url = new URL(req.url);

  const productId = (
    url.searchParams.get("productId") ?? ""
  ).trim();

  const products = await prisma.product.findMany({
    where: productId
      ? {
          id: productId,
        }
      : undefined,

    select: {
      id: true,
      cardsPerPack: true,
      packPriceCents: true,
      autoPackPricing: true,
      released: true,

      productSets: {
        select: {
          id: true,
          isBase: true,
          oddsPerPack: true,
        },
      },
    },

    orderBy: {
      id: "asc",
    },
  });

  if (productId && products.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Product not found: ${productId}`,
      },
      {
        status: 404,
      }
    );
  }

  const setIds: string[] = [];

  for (const product of products) {
    for (const productSet of product.productSets) {
      setIds.push(productSet.id);
    }
  }

  const bySet =
    setIds.length > 0
      ? await prisma.card.groupBy({
          by: ["productSetId"],

          where: {
            productSetId: {
              in: setIds,
            },
          },

          _avg: {
            bookValue: true,
          },

          _count: {
            _all: true,
          },
        })
      : [];

  const setStats = new Map<
    string,
    {
      avg: number;
      count: number;
    }
  >();

  for (const row of bySet) {
    const productSetId = row.productSetId ?? "";

    if (!productSetId) continue;

    setStats.set(productSetId, {
      avg: num(row._avg?.bookValue),
      count: num(row._count?._all),
    });
  }

  const priceUpdates: Array<{
    productId: string;
    packPriceCents: number;
  }> = [];

  const items = products.map((product) => {
    const cardsPerPack =
      typeof product.cardsPerPack === "number" &&
      product.cardsPerPack > 0
        ? product.cardsPerPack
        : 15;

    const baseSets = product.productSets.filter(
      (productSet) => productSet.isBase
    );

    const insertSets = product.productSets.filter(
      (productSet) =>
        !productSet.isBase &&
        (productSet.oddsPerPack ?? 0) > 0
    );

    let baseCountTotal = 0;
    let baseValueTotal = 0;

    for (const baseSet of baseSets) {
      const stats = setStats.get(baseSet.id) ?? {
        avg: 0,
        count: 0,
      };

      baseCountTotal += stats.count;
      baseValueTotal += stats.avg * stats.count;
    }

    const avgBaseValue =
      baseCountTotal > 0
        ? baseValueTotal / baseCountTotal
        : 0;

    let evPerPack =
      cardsPerPack * avgBaseValue;

    let expectedInsertsPerPack = 0;

    const inserts = insertSets.map((insertSet) => {
      const oddsPerPack =
        insertSet.oddsPerPack ?? 0;

      const pHit =
        oddsPerPack > 0
          ? 1 / oddsPerPack
          : 0;

      const stats = setStats.get(insertSet.id) ?? {
        avg: 0,
        count: 0,
      };

      /*
       * If an insert set has no cards, ripping effectively
       * replaces it with a base card. It therefore contributes
       * no additional EV.
       */
      const avgInsertValue =
        stats.count > 0
          ? stats.avg
          : avgBaseValue;

      expectedInsertsPerPack += pHit;

      evPerPack +=
        pHit *
        (avgInsertValue - avgBaseValue);

      return {
        productSetId: insertSet.id,
        oddsPerPack,
        pHit,
        avgInsertValue,
        insertCardCount: stats.count,
      };
    });

    const existingPackPriceCents =
      product.packPriceCents ?? 0;

    const calculatedPackPriceCents =
      product.autoPackPricing
        ? automaticPackPriceCents(evPerPack)
        : existingPackPriceCents;

    if (
      product.autoPackPricing &&
      calculatedPackPriceCents !== existingPackPriceCents
    ) {
      priceUpdates.push({
        productId: product.id,
        packPriceCents: calculatedPackPriceCents,
      });
    }

    const packPriceDollars =
      calculatedPackPriceCents / 100;

    return {
      productId: product.id,
      released: product.released,
      autoPackPricing: product.autoPackPricing,
      cardsPerPack,
      avgBaseValue,
      expectedInsertsPerPack,
      evPerPack,
      packPriceDollars,

      evPerDollar:
        packPriceDollars > 0
          ? evPerPack / packPriceDollars
          : null,

      inserts,
    };
  });

  if (priceUpdates.length > 0) {
    await prisma.$transaction(
      priceUpdates.map((update) =>
        prisma.product.update({
          where: {
            id: update.productId,
          },
          data: {
            packPriceCents:
              update.packPriceCents,
          },
        })
      )
    );
  }

  return NextResponse.json({
    ok: true,
    items,
    updatedPrices: priceUpdates.length,
  });
}