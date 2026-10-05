import type { Prisma } from "@prisma/client";
import {
  RAW_GRADE,
  bookValueToCents,
  calculateGradedValueCents,
  getEffectiveGradeability,
} from "@/lib/grading";
import { getChicagoDateKey } from "@/lib/analytics-math";

type PortfolioDb = Pick<
  Prisma.TransactionClient,
  | "user"
  | "cardOwnership"
  | "gradingOrder"
  | "sealedInventory"
  | "financialDailySnapshot"
>;

export type PortfolioValue = {
  balanceCents: number;
  collectionValueCents: number;
  sealedValueCents: number;
  netWorthCents: number;
};

export async function getCollectionValueCents(db: PortfolioDb, userId: string) {
  const ownerships = await db.cardOwnership.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: {
      quantity: true,
      grade: true,
      card: {
        select: {
          bookValue: true,
          gradeabilityOverride: true,
          productSet: { select: { defaultGradeability: true } },
        },
      },
    },
  });

  let total = 0;

  for (const ownership of ownerships) {
    const quantity = Math.max(0, ownership.quantity ?? 0);
    if (quantity <= 0) continue;

    const rawBookValueCents = bookValueToCents(ownership.card.bookValue);

    if (ownership.grade === RAW_GRADE) {
      total += rawBookValueCents * quantity;
      continue;
    }

    const gradeability = getEffectiveGradeability({
      cardOverride: ownership.card.gradeabilityOverride,
      productSetDefault: ownership.card.productSet?.defaultGradeability,
    });

    total +=
      calculateGradedValueCents({
        rawBookValueCents,
        gradeability,
        grade: ownership.grade,
      }) * quantity;
  }

  const pendingOrders = await db.gradingOrder.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
      status: { in: ["PENDING", "READY"] },
    },
    select: {
      quantity: true,
      card: { select: { bookValue: true } },
    },
  });

  for (const order of pendingOrders) {
    total += bookValueToCents(order.card.bookValue) * Math.max(0, order.quantity ?? 0);
  }

  return total;
}

export async function getSealedValueCents(db: PortfolioDb, userId: string) {
  const result = await db.sealedInventory.aggregate({
    where: { userId, packsOwned: { gt: 0 } },
    _sum: { costBasisCents: true },
  });

  return Math.max(0, result._sum.costBasisCents ?? 0);
}

export async function getPortfolioValue(
  db: PortfolioDb,
  userId: string
): Promise<PortfolioValue> {
  const [user, collectionValueCents, sealedValueCents] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { balanceCents: true } }),
    getCollectionValueCents(db, userId),
    getSealedValueCents(db, userId),
  ]);

  if (!user) throw new Error("User not found");

  const balanceCents = user.balanceCents ?? 0;
  const netWorthCents = balanceCents + collectionValueCents + sealedValueCents;

  return {
    balanceCents,
    collectionValueCents,
    sealedValueCents,
    netWorthCents,
  };
}

export async function syncDailyPortfolioSnapshot(
  db: PortfolioDb,
  userId: string,
  now = new Date()
) {
  const dateKey = getChicagoDateKey(now);
  const portfolio = await getPortfolioValue(db, userId);

  const [existing, previous] = await Promise.all([
    db.financialDailySnapshot.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    }),
    db.financialDailySnapshot.findFirst({
      where: { userId, dateKey: { lt: dateKey }, valuationVersion: { gte: 2 } },
      orderBy: { dateKey: "desc" },
    }),
  ]);

  const openingNetWorthCents =
    existing && existing.valuationVersion >= 2
      ? existing.openingNetWorthCents
      : previous?.closingNetWorthCents ?? portfolio.netWorthCents;

  return db.financialDailySnapshot.upsert({
    where: { userId_dateKey: { userId, dateKey } },
    create: {
      userId,
      dateKey,
      balanceCents: portfolio.balanceCents,
      collectionValueCents: portfolio.collectionValueCents,
      sealedValueCents: portfolio.sealedValueCents,
      openingNetWorthCents,
      closingNetWorthCents: portfolio.netWorthCents,
      netWorthCents: portfolio.netWorthCents,
      valuationVersion: 2,
    },
    update: {
      balanceCents: portfolio.balanceCents,
      collectionValueCents: portfolio.collectionValueCents,
      sealedValueCents: portfolio.sealedValueCents,
      openingNetWorthCents,
      closingNetWorthCents: portfolio.netWorthCents,
      netWorthCents: portfolio.netWorthCents,
      valuationVersion: 2,
    },
  });
}
