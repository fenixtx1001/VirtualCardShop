// src/lib/prestige.ts
import { Prisma } from "@prisma/client";

export type PrestigeAward = {
  productSetId: string;
  fromLevel: number;
  toLevel: number;
  awardedCents: number;
  setValue: number; // dollars
};

const PRESTIGE_MILESTONE_MULTIPLIERS: Record<number, number> = {
  1: 0.05,
  2: 0.075,
  3: 0.1,
  4: 0.15,
  5: 0.25,
  10: 0.5,
  25: 2.0,
  50: 3.0,
  75: 5.0,
  100: 8.0,
};

function safeMoney(n: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function getPrestigeRewardMultiplier(level: number) {
  return PRESTIGE_MILESTONE_MULTIPLIERS[level] ?? 0;
}

export function isPrestigeRewardMilestone(level: number) {
  return Object.prototype.hasOwnProperty.call(PRESTIGE_MILESTONE_MULTIPLIERS, level);
}

/**
 * level = min effective quantity across all cards in that ProductSet
 * setValue = sum(bookValue) across all cards in that ProductSet (dollars)
 *
 * Effective prestige ownership counts cards the user still controls:
 * - raw ownership
 * - revealed graded ownership
 * - unrevealed grading orders, because those cards are still owned
 *
 * Revealed grading orders do NOT count separately because their results have
 * already been transferred into CardOwnership.
 *
 * Sold cards do not count because they are no longer in CardOwnership and
 * should not be in unrevealed grading orders.
 */
export async function computeProductSetLevel(
  tx: Prisma.TransactionClient,
  userId: string,
  productSetId: string
) {
  const cards = await tx.card.findMany({
    where: { productSetId },
    select: { id: true, bookValue: true },
  });

  if (cards.length === 0) return { level: 0, setValue: 0 };

  const ids = cards.map((c) => c.id);

  const owns = await tx.cardOwnership.groupBy({
    by: ["cardId"],
    where: {
      userId,
      cardId: { in: ids },
      quantity: { gt: 0 },
    },
    _sum: {
      quantity: true,
    },
  });

  const unrevealedGradingOrders = await tx.gradingOrder.groupBy({
    by: ["cardId"],
    where: {
      userId,
      cardId: { in: ids },
      quantity: { gt: 0 },
      revealedAt: null,
    },
    _sum: {
      quantity: true,
    },
  });

  const qtyById = new Map<number, number>();

  for (const o of owns) {
    qtyById.set(o.cardId, (qtyById.get(o.cardId) ?? 0) + (o._sum.quantity ?? 0));
  }

  for (const o of unrevealedGradingOrders) {
    qtyById.set(o.cardId, (qtyById.get(o.cardId) ?? 0) + (o._sum.quantity ?? 0));
  }

  let minQty = Number.POSITIVE_INFINITY;
  let setValue = 0;

  for (const c of cards) {
    const bv = safeMoney(c.bookValue);
    setValue += bv;

    const q = qtyById.get(c.id) ?? 0;
    if (q < minQty) minQty = q;
  }

  if (!Number.isFinite(minQty)) minQty = 0;

  return { level: Math.max(0, Math.floor(minQty)), setValue };
}

/**
 * Sync progress only (no money):
 * - ensure ProductSetPrestige row exists
 * - keep timesCompleted in sync with current computed level
 *
 * Important: never move timesCompleted backward. If a user previously reached
 * a higher completion level, we preserve that historical progress.
 *
 * Call this after pack open for productSetIds involved (base + any inserts pulled).
 */
export async function syncPrestigeProgressForProductSets(opts: {
  tx: Prisma.TransactionClient;
  userId: string;
  productSetIds: string[];
}) {
  const { tx, userId } = opts;
  const uniq = Array.from(new Set((opts.productSetIds || []).filter(Boolean)));
  if (uniq.length === 0) return { updated: 0 };

  let updated = 0;

  for (const productSetId of uniq) {
    const { level: currentLevel } = await computeProductSetLevel(tx, userId, productSetId);

    const row = await tx.productSetPrestige.upsert({
      where: { userId_productSetId: { userId, productSetId } },
      create: {
        userId,
        productSetId,
        timesCompleted: Math.max(0, currentLevel),
        claimedCompletions: 0,
        bonusAwardedCents: 0,
      },
      update: {},
      select: { timesCompleted: true },
    });

    const prev = row.timesCompleted ?? 0;
    if (currentLevel > prev) {
      await tx.productSetPrestige.update({
        where: { userId_productSetId: { userId, productSetId } },
        data: { timesCompleted: currentLevel },
      });
      updated++;
    }
  }

  return { updated };
}

/**
 * Redeem for ONE ProductSet:
 * - claimable completions = effectiveLevel - claimedCompletions
 * - awards only when crossing prestige milestones
 * - increments user.balanceCents + bonusAwardedCents, advances claimedCompletions
 *
 * This is what your Showcase "Claim" button should call.
 */
export async function redeemPrestigeForProductSet(opts: {
  tx: Prisma.TransactionClient;
  userId: string;
  productSetId: string;
}) {
  const { tx, userId, productSetId } = opts;

  const { level: currentLevel, setValue } = await computeProductSetLevel(tx, userId, productSetId);

  const prog = await tx.productSetPrestige.upsert({
    where: { userId_productSetId: { userId, productSetId } },
    create: {
      userId,
      productSetId,
      timesCompleted: Math.max(0, currentLevel),
      claimedCompletions: 0,
      bonusAwardedCents: 0,
    },
    update: {},
    select: { claimedCompletions: true, timesCompleted: true, bonusAwardedCents: true },
  });

  const alreadyClaimed = prog.claimedCompletions ?? 0;
  const effectiveLevel = Math.max(prog.timesCompleted ?? 0, currentLevel);
  const claimable = Math.max(0, effectiveLevel - alreadyClaimed);

  if (claimable <= 0 || setValue <= 0) {
    return {
      ok: true as const,
      productSetId,
      currentLevel: effectiveLevel,
      claimedCompletions: alreadyClaimed,
      claimable: 0,
      awardedCents: 0,
      setValue,
      fromLevel: alreadyClaimed,
      toLevel: alreadyClaimed,
    };
  }

  let awardedCents = 0;
  const fromLevel = alreadyClaimed;
  const toLevel = effectiveLevel;

  for (let lvl = alreadyClaimed + 1; lvl <= effectiveLevel; lvl++) {
    const multiplier = getPrestigeRewardMultiplier(lvl);
    if (multiplier > 0) {
      const cents = Math.round(setValue * multiplier * 100);
      if (cents > 0) awardedCents += cents;
    }
  }

  if (awardedCents > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { balanceCents: { increment: awardedCents } },
    });
  }

  await tx.productSetPrestige.update({
    where: { userId_productSetId: { userId, productSetId } },
    data: {
      timesCompleted: Math.max(prog.timesCompleted ?? 0, effectiveLevel),
      claimedCompletions: effectiveLevel,
      bonusAwardedCents: { increment: awardedCents },
    },
  });

  return {
    ok: true as const,
    productSetId,
    currentLevel: effectiveLevel,
    claimedCompletions: effectiveLevel,
    claimable,
    awardedCents,
    setValue,
    fromLevel,
    toLevel,
  };
}

/**
 * Redeem across multiple ProductSets (useful for "Claim All" in Showcase)
 */
export async function redeemPrestigeForProductSets(opts: {
  tx: Prisma.TransactionClient;
  userId: string;
  productSetIds: string[];
}) {
  const { tx, userId } = opts;
  const uniq = Array.from(new Set((opts.productSetIds || []).filter(Boolean)));
  if (uniq.length === 0) return { totalAwardedCents: 0, awards: [] as PrestigeAward[] };

  let totalAwardedCents = 0;
  const awards: PrestigeAward[] = [];

  for (const productSetId of uniq) {
    const res = await redeemPrestigeForProductSet({ tx, userId, productSetId });
    if (res.awardedCents > 0) {
      totalAwardedCents += res.awardedCents;
      awards.push({
        productSetId,
        fromLevel: res.fromLevel,
        toLevel: res.toLevel,
        awardedCents: res.awardedCents,
        setValue: res.setValue,
      });
    }
  }

  return { totalAwardedCents, awards };
}