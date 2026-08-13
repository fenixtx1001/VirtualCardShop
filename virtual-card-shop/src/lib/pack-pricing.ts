import { prisma } from "@/lib/prisma";

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