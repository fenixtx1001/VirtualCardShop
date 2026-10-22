import { prisma } from "@/lib/prisma";
import { effectiveHitProbabilities, parsePackRarityConfig } from "@/lib/pack-rarity";

export const PACK_EV_TARGET_RATIO = 2;
export const PACK_PRICE_INCREMENT_CENTS = 5;

export type ProductPackPricing = {
  productId: string;
  released: boolean;
  autoPackPricing: boolean;
  cardsPerPack: number;
  avgBaseValue: number;
  expectedInsertsPerPack: number;
  evPerPack: number;
  packPriceCents: number;
  packPriceDollars: number;
  evPerDollar: number | null;
  inserts: Array<{
    productSetId: string;
    oddsPerPack: number;
    pHit: number;
    avgInsertValue: number;
    insertCardCount: number;
    subset?: string;
  }>;
};

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function automaticPackPriceCents(evPerPack: number) {
  if (!Number.isFinite(evPerPack) || evPerPack <= 0) return 0;

  const exactCents = (evPerPack / PACK_EV_TARGET_RATIO) * 100;

  return Math.max(
    PACK_PRICE_INCREMENT_CENTS,
    Math.round(exactCents / PACK_PRICE_INCREMENT_CENTS) *
      PACK_PRICE_INCREMENT_CENTS
  );
}

export async function calculateProductPackPricing(
  productId: string
): Promise<ProductPackPricing | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      released: true,
      autoPackPricing: true,
      cardsPerPack: true,
      packPriceCents: true,
      packRarityConfig: true,
      productSets: {
        select: {
          id: true,
          isBase: true,
          oddsPerPack: true,
        },
      },
    },
  });

  if (!product) return null;

  const setIds = product.productSets.map((set) => set.id);

  const grouped =
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

  const stats = new Map<string, { avg: number; count: number }>();

  for (const row of grouped) {
    if (!row.productSetId) continue;

    stats.set(row.productSetId, {
      avg: num(row._avg.bookValue),
      count: num(row._count._all),
    });
  }

  const cardsPerPack =
    typeof product.cardsPerPack === "number" && product.cardsPerPack > 0
      ? product.cardsPerPack
      : 15;

  const baseSets = product.productSets.filter((set) => set.isBase);

  const insertSets = product.productSets.filter(
    (set) => !set.isBase && (set.oddsPerPack ?? 0) > 0
  );

  let baseCount = 0;
  let baseValueTotal = 0;

  for (const baseSet of baseSets) {
    const stat = stats.get(baseSet.id) ?? {
      avg: 0,
      count: 0,
    };

    baseCount += stat.count;
    baseValueTotal += stat.avg * stat.count;
  }

  const avgBaseValue =
    baseCount > 0 ? baseValueTotal / baseCount : 0;

  const rarityConfig = parsePackRarityConfig(product.packRarityConfig);
  if (rarityConfig) {
    // Pull weighting and auto-pricing use exactly the SAME rarity config,
    // including the uniform slot cap when several events hit together.
    const split = await prisma.card.groupBy({
      by: ["productSetId", "subset"],
      where: { productSetId: { in: setIds } },
      _avg: { bookValue: true },
      _count: { _all: true },
    });
    const subsetStats = new Map(
      split.map(row => [
        JSON.stringify([row.productSetId, row.subset]),
        {
          avg: num(row._avg.bookValue),
          count: num(row._count._all),
        },
      ] as const)
    );
    const lookup = (id: string, subset: string) =>
      subsetStats.get(JSON.stringify([id, subset]));
    const fallback = lookup(
      rarityConfig.fallback.productSetId,
      rarityConfig.fallback.subset
    );
    if (!fallback?.count) {
      throw new Error("Configured base fallback pool missing from pricing data");
    }
    const commonValue = fallback.avg;
    const events = [
      ...insertSets.map(set => ({
        productSetId: set.id,
        oddsPerPack: set.oddsPerPack!,
        subset: undefined as string | undefined,
      })),
      ...rarityConfig.hits,
    ];
    const probabilities = effectiveHitProbabilities(events, cardsPerPack);
    let ev = cardsPerPack * commonValue;
    let expected = 0;
    const rarityInserts = events.map((event, index) => {
      const summary = event.subset
        ? lookup(event.productSetId, event.subset)
        : stats.get(event.productSetId);
      if (!summary?.count) {
        throw new Error(
          "Configured pack hit has no matching cards in " +
          event.productSetId + ": " + (event.subset ?? "whole ProductSet")
        );
      }
      const pHit = probabilities[index];
      expected += pHit;
      ev += pHit * (summary.avg - commonValue);
      return {
        productSetId: event.productSetId,
        oddsPerPack: event.oddsPerPack,
        pHit,
        avgInsertValue: summary.avg,
        insertCardCount: summary.count,
        ...(event.subset ? { subset: event.subset } : {}),
      };
    });
    const price = product.autoPackPricing
      ? automaticPackPriceCents(ev)
      : product.packPriceCents ?? 0;
    return {
      productId: product.id,
      released: product.released,
      autoPackPricing: product.autoPackPricing,
      cardsPerPack,
      avgBaseValue: commonValue,
      expectedInsertsPerPack: expected,
      evPerPack: ev,
      packPriceCents: price,
      packPriceDollars: price / 100,
      evPerDollar: price > 0 ? ev / (price / 100) : null,
      inserts: rarityInserts,
    };
  }

  let evPerPack = cardsPerPack * avgBaseValue;
  let expectedInsertsPerPack = 0;

  const inserts = insertSets.map((insertSet) => {
    const oddsPerPack = insertSet.oddsPerPack ?? 0;
    const pHit = oddsPerPack > 0 ? 1 / oddsPerPack : 0;

    const stat = stats.get(insertSet.id) ?? {
      avg: 0,
      count: 0,
    };

    const avgInsertValue =
      stat.count > 0 ? stat.avg : avgBaseValue;

    expectedInsertsPerPack += pHit;
    evPerPack += pHit * (avgInsertValue - avgBaseValue);

    return {
      productSetId: insertSet.id,
      oddsPerPack,
      pHit,
      avgInsertValue,
      insertCardCount: stat.count,
    };
  });

  const packPriceCents = product.autoPackPricing
    ? automaticPackPriceCents(evPerPack)
    : product.packPriceCents ?? 0;

  const packPriceDollars = packPriceCents / 100;

  return {
    productId: product.id,
    released: product.released,
    autoPackPricing: product.autoPackPricing,
    cardsPerPack,
    avgBaseValue,
    expectedInsertsPerPack,
    evPerPack,
    packPriceCents,
    packPriceDollars,
    evPerDollar:
      packPriceDollars > 0
        ? evPerPack / packPriceDollars
        : null,
    inserts,
  };
}

export async function repriceProduct(productId: string) {
  const pricing = await calculateProductPackPricing(productId);

  if (!pricing) return null;

  if (pricing.autoPackPricing) {
    await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        packPriceCents: pricing.packPriceCents,
      },
    });
  }

  return pricing;
}

export async function repriceProducts(productId?: string) {
  const ids = productId
    ? [{ id: productId }]
    : await prisma.product.findMany({
        select: {
          id: true,
        },
        orderBy: {
          id: "asc",
        },
      });

  const items: ProductPackPricing[] = [];

  for (const row of ids) {
    const pricing = await repriceProduct(row.id);

    if (pricing) {
      items.push(pricing);
    }
  }

  return items;
}  