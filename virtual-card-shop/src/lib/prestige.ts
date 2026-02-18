// src/lib/prestige.ts
import { Prisma } from "@prisma/client";

export type PrestigeAward = {
  productSetId: string;
  fromLevel: number;
  toLevel: number;
  awardedCents: number;
  setValue: number; // dollars
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pctForLevel(level: number) {
  // 2% per completion level, capped at 50%
  return clamp(level * 0.02, 0, 0.5);
}

/**
 * level = min quantity owned across all cards in that ProductSet
 * setValue = sum(bookValue) across all cards in that ProductSet (dollars)
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

  const owns = await tx.cardOwnership.findMany({
    where: { userId, cardId: { in: ids } },
    select: { cardId: true, quantity: true },
  });

  const qtyById = new Map<number, number>();
  for (const o of owns) qtyById.set(o.cardId, o.quantity);

  let minQty = Number.POSITIVE_INFINITY;
  let setValue = 0;

  for (const c of cards) {
    const bv = typeof c.bookValue === "number" && Number.isFinite(c.bookValue) ? c.bookValue : 0;
    setValue += bv;

    const q = qtyById.get(c.id) ?? 0;
    if (q < minQty) minQty = q;
  }

  if (!Number.isFinite(minQty)) minQty = 0;

  return { level: minQty, setValue };
}

/**
 * Sync progress only (no money):
 * - ensure ProductSetPrestige row exists
 * - keep timesCompleted in sync with current computed level
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
 * - claimable completions = currentLevel - claimedCompletions
 * - awards calculated per newly-claimed completion level
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

  // Ensure row exists & keep timesCompleted forward-moving
  const prog = await tx.productSetPrestige.upsert({
    where: { userId_productSetId: { userId, productSetId } },
    create: {
      userId,
      productSetId,
      timesCompleted: Math.max(0, currentLevel),
      claimedCompletions: 0,
      bonusAwardedCents: 0,
    },
    update: {
      timesCompleted: Math.max(0, currentLevel),
    },
    select: { claimedCompletions: true, timesCompleted: true, bonusAwardedCents: true },
  });

  const alreadyClaimed = prog.claimedCompletions ?? 0;
  const claimable = Math.max(0, currentLevel - alreadyClaimed);

  if (claimable <= 0 || setValue <= 0) {
    return {
      ok: true as const,
      productSetId,
      currentLevel,
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
  const toLevel = currentLevel;

  for (let lvl = alreadyClaimed + 1; lvl <= currentLevel; lvl++) {
    const pct = pctForLevel(lvl);
    const cents = Math.round(setValue * pct * 100);
    if (cents > 0) awardedCents += cents;
  }

  // Apply payout + advance claimed completions (milestone protection)
  await tx.user.update({
    where: { id: userId },
    data: { balanceCents: { increment: awardedCents } },
  });

  await tx.productSetPrestige.update({
    where: { userId_productSetId: { userId, productSetId } },
    data: {
      timesCompleted: Math.max(prog.timesCompleted ?? 0, currentLevel),
      claimedCompletions: currentLevel,
      bonusAwardedCents: { increment: awardedCents },
    },
  });

  return {
    ok: true as const,
    productSetId,
    currentLevel,
    claimedCompletions: currentLevel,
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
