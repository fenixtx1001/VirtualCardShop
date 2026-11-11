import { Prisma } from "@prisma/client";
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
  | "$queryRaw"
>;

export type PortfolioValue = {
  balanceCents: number;
  collectionValueCents: number;
  sealedValueCents: number;
  netWorthCents: number;
};

/**
 * Price catalog revision is advanced by a DB trigger, so even direct SQL
 * imports and administrator repricing invalidate the fast snapshot path.
 *
 * lock=true MUST be called inside the same transaction as the pack and
 * snapshot write. A price change then cannot commit between validation and
 * the transaction committing: its trigger needs the locked revision row.
 *
 * Missing migration, unavailable revision, or query failure => no fast path.
 */
async function readCardPriceRevision(
  db: PortfolioDb,
  lock = false
): Promise<bigint | null> {
  if (typeof db.$queryRaw !== "function") return null;
  try {
    type Row = { revision: bigint };
    const rows = lock
      ? await db.$queryRaw<Row[]>(Prisma.sql`
          SELECT "revision" FROM "CardPriceRevision"
          WHERE "id" = 1 FOR UPDATE
        `)
      : await db.$queryRaw<Row[]>(Prisma.sql`
          SELECT "revision" FROM "CardPriceRevision" WHERE "id" = 1
        `);
    return rows.length === 1 && typeof rows[0]?.revision === "bigint"
      ? rows[0].revision : null;
  } catch {
    return null;
  }
}

async function getCollectionValueCentsLegacy(db: PortfolioDb, userId: string) {
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

/**
 * Aggregate the exact same card values by (bookValue, grade) inside Postgres.
 * That returns a small number of value buckets rather than transferring
 * tens of thousands of individual ownership/card rows over the network.
 *
 * Each bucket is still valued with the existing JavaScript grading code,
 * so sliding grade premiums, cent rounding, pending grading and the
 * valuation floor remain unchanged.
 *
 * Kill switch: VCS_PORTFOLIO_GROUPED_VALUES=0. On any SQL failure the old
 * calculation runs, preserving financial correctness over speed.
 */
export async function getCollectionValueCents(db: PortfolioDb, userId: string) {
  if (
    process.env.VCS_PORTFOLIO_GROUPED_VALUES === "0" ||
    // The grouped calculation is valid while all gradeability profiles share
    // the same VCS grade multipliers. Auto-disable if that rule ever changes.
    getEffectiveGradeability({ cardOverride: "ICONIC", productSetDefault: "GREAT" }) !==
      getEffectiveGradeability({ cardOverride: "COMMON", productSetDefault: "COMMON" }) ||
    typeof db.$queryRaw !== "function"
  ) {
    return getCollectionValueCentsLegacy(db, userId);
  }

  type ValueBucket = { bookValue: number; grade: number; quantity: bigint };
  try {
    const [holdings, pending] = await Promise.all([
      db.$queryRaw<ValueBucket[]>(Prisma.sql`
        SELECT c."bookValue" AS "bookValue",
               o.grade,
               SUM(o.quantity)::bigint AS quantity
        FROM "CardOwnership" o
        INNER JOIN "Card" c ON c.id = o."cardId"
        WHERE o."userId" = ${userId} AND o.quantity > 0
        GROUP BY c."bookValue", o.grade
      `),
      db.$queryRaw<ValueBucket[]>(Prisma.sql`
        SELECT c."bookValue" AS "bookValue",
               0::integer AS grade,
               SUM(g.quantity)::bigint AS quantity
        FROM "GradingOrder" g
        INNER JOIN "Card" c ON c.id = g."cardId"
        WHERE g."userId" = ${userId}
          AND g.quantity > 0
          AND g.status IN ('PENDING', 'READY')
        GROUP BY c."bookValue"
      `),
    ]);

    let total = 0;
    for (const row of holdings) {
      const qty = Number(row.quantity);
      if (!Number.isSafeInteger(qty) || qty < 0) {
        return getCollectionValueCentsLegacy(db, userId);
      }
      const raw = bookValueToCents(row.bookValue);
      const unit = row.grade === RAW_GRADE
        ? raw
        : calculateGradedValueCents({
            rawBookValueCents: raw,
            gradeability: "COMMON",
            grade: row.grade,
          });
      total += unit * qty;
    }
    for (const row of pending) {
      const qty = Number(row.quantity);
      if (!Number.isSafeInteger(qty) || qty < 0) {
        return getCollectionValueCentsLegacy(db, userId);
      }
      total += bookValueToCents(row.bookValue) * qty;
    }
    if (!Number.isSafeInteger(total) || total < 0) {
      return getCollectionValueCentsLegacy(db, userId);
    }
    return total;
  } catch (error) {
    console.warn(
      "VCS grouped portfolio valuation fallback:",
      error instanceof Error ? error.message : "unknown"
    );
    return getCollectionValueCentsLegacy(db, userId);
  }
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
  const priceRevisionBefore = await readCardPriceRevision(db);
  const portfolio = await getPortfolioValue(db, userId);
  const priceRevisionAfter = await readCardPriceRevision(db);
  // Never certify a snapshot if prices changed during valuation. A new
  // price mutation immediately after this read will increment the catalog
  // revision and invalidate it before the next incremental rip.
  const cardPriceRevision =
    priceRevisionBefore !== null && priceRevisionBefore === priceRevisionAfter
      ? priceRevisionAfter : null;

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
      cardPriceRevision,
    },
    update: {
      balanceCents: portfolio.balanceCents,
      collectionValueCents: portfolio.collectionValueCents,
      sealedValueCents: portfolio.sealedValueCents,
      openingNetWorthCents,
      closingNetWorthCents: portfolio.netWorthCents,
      netWorthCents: portfolio.netWorthCents,
      valuationVersion: 2,
      cardPriceRevision,
    },
  });
}


/**
 * Fast path for auction settlements when the EXACT portfolio deltas are known.
 * A sold copy changes cash plus collection value, but not sealed inventory.
 * Keep this inside the same transaction as the ownership/cash changes.
 *
 * If today's snapshot is absent, stale, or changed concurrently, return false
 * and let the caller fall back to a complete portfolio revaluation.
 * Never update openingNetWorthCents: it is the day's fixed baseline.
 */
export async function trySyncAuctionPortfolioDelta(
  db: PortfolioDb,
  userId: string,
  delta: { balanceDeltaCents: number; collectionDeltaCents: number },
  now = new Date()
): Promise<boolean> {
  const { balanceDeltaCents, collectionDeltaCents } = delta;
  const netWorthDeltaCents = balanceDeltaCents + collectionDeltaCents;
  if (![balanceDeltaCents, collectionDeltaCents, netWorthDeltaCents]
    .every(Number.isSafeInteger)) return false;

  const dateKey = getChicagoDateKey(now);
  const [user, existing] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { balanceCents: true } }),
    db.financialDailySnapshot.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
      select: {
        id: true,
        balanceCents: true,
        collectionValueCents: true,
        sealedValueCents: true,
        netWorthCents: true,
        closingNetWorthCents: true,
        valuationVersion: true,
      },
    }),
  ]);
  if (!user || !existing || existing.valuationVersion < 2) return false;

  const oldBalance = user.balanceCents - balanceDeltaCents;
  const collectionAfter = existing.collectionValueCents + collectionDeltaCents;
  const closingAfter = existing.closingNetWorthCents + netWorthDeltaCents;
  if (![oldBalance, collectionAfter, closingAfter].every(Number.isSafeInteger) ||
    collectionAfter < 0) return false;

  // Any unrelated cash or valuation write since the last snapshot requires
  // a full scan rather than an optimistic incremental update.
  if (existing.balanceCents !== oldBalance ||
    existing.netWorthCents !== existing.closingNetWorthCents ||
    existing.closingNetWorthCents !==
      existing.balanceCents + existing.collectionValueCents + existing.sealedValueCents) {
    return false;
  }

  const changed = await db.financialDailySnapshot.updateMany({
    where: {
      id: existing.id,
      valuationVersion: existing.valuationVersion,
      balanceCents: existing.balanceCents,
      collectionValueCents: existing.collectionValueCents,
      sealedValueCents: existing.sealedValueCents,
      netWorthCents: existing.netWorthCents,
      closingNetWorthCents: existing.closingNetWorthCents,
    },
    data: {
      balanceCents: user.balanceCents,
      collectionValueCents: { increment: collectionDeltaCents },
      closingNetWorthCents: { increment: netWorthDeltaCents },
      netWorthCents: { increment: netWorthDeltaCents },
    },
  });
  return changed.count === 1;
}

/**
 * Incremental valuation for a single pack rip.
 *
 * Preconditions:
 * - called INSIDE the same transaction that decrements sealed inventory
 *   and creates the pulled ownership;
 * - current cash is unchanged;
 * - the caller supplies exactly the raw book value of every newly owned card
 *   and the sealed cost basis removed from inventory.
 *
 * If today's snapshot is absent/inconsistent or another transaction changed
 * it, return false; the caller must perform a full revaluation.
 */
export async function trySyncPackPortfolioDelta(
  db: PortfolioDb,
  userId: string,
  delta: { collectionDeltaCents: number; sealedDeltaCents: number },
  now = new Date()
): Promise<boolean> {
  // Opt-in rollout only. A database migration by itself must not change pack
  // accounting; enable explicitly after independent migration verification.
  if (process.env.VCS_PACK_PORTFOLIO_DELTA !== "1") return false;
  const { collectionDeltaCents, sealedDeltaCents } = delta;
  const netWorthDelta = collectionDeltaCents + sealedDeltaCents;
  if (![collectionDeltaCents, sealedDeltaCents, netWorthDelta]
    .every(Number.isSafeInteger)) return false;

  // Acquire the revision-row lock before checking the snapshot, and keep it
  // until the enclosing pack-opening DB transaction commits. The trigger
  // increment for any concurrent Card.bookValue mutation must then wait.
  const priceRevision = await readCardPriceRevision(db, true);
  if (priceRevision === null) return false;

  const dateKey = getChicagoDateKey(now);
  const [user, snapshot] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { balanceCents: true } }),
    db.financialDailySnapshot.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
      select: {
        id: true, balanceCents: true, collectionValueCents: true,
        sealedValueCents: true, closingNetWorthCents: true,
        netWorthCents: true, valuationVersion: true,
        cardPriceRevision: true,
      },
    }),
  ]);

  if (!user || !snapshot || snapshot.valuationVersion < 2 ||
      snapshot.cardPriceRevision === null ||
      snapshot.cardPriceRevision !== priceRevision) {
    return false;
  }
  const newCollection = snapshot.collectionValueCents + collectionDeltaCents;
  const newSealed = snapshot.sealedValueCents + sealedDeltaCents;
  const newNet = snapshot.closingNetWorthCents + netWorthDelta;
  if (![newCollection, newSealed, newNet].every(Number.isSafeInteger) ||
    newCollection < 0 || newSealed < 0) return false;
  if (snapshot.balanceCents !== user.balanceCents ||
    snapshot.netWorthCents !== snapshot.closingNetWorthCents ||
    snapshot.closingNetWorthCents !==
      snapshot.balanceCents + snapshot.collectionValueCents + snapshot.sealedValueCents) {
    return false;
  }

  // Compare-and-swap prevents stale deltas overwriting a concurrent
  // financial event. Preserve openingNetWorthCents for daily climb.
  const changed = await db.financialDailySnapshot.updateMany({
    where: {
      id: snapshot.id,
      valuationVersion: snapshot.valuationVersion,
      balanceCents: snapshot.balanceCents,
      collectionValueCents: snapshot.collectionValueCents,
      sealedValueCents: snapshot.sealedValueCents,
      netWorthCents: snapshot.netWorthCents,
      closingNetWorthCents: snapshot.closingNetWorthCents,
      cardPriceRevision: priceRevision,
    },
    data: {
      collectionValueCents: { increment: collectionDeltaCents },
      sealedValueCents: { increment: sealedDeltaCents },
      netWorthCents: { increment: netWorthDelta },
      closingNetWorthCents: { increment: netWorthDelta },
    },
  });
  return changed.count === 1;
}


/**
 * Fast, atomic snapshot maintenance for transactions that ONLY change cash.
 *
 * Every reward still records a FinancialTransaction. For an already-current
 * version-2 daily snapshot, adding cash cannot change the collection or sealed
 * valuation, so there is no reason to scan thousands of owned cards.
 *
 * A missing, stale, or inconsistent snapshot falls back to the full valuation.
 * This preserves the midnight baseline and self-heals older snapshot data.
 * Call from the SAME transaction that updates the User balance.
 */
export async function syncCashOnlyDailyPortfolioSnapshot(
  db: PortfolioDb,
  userId: string,
  previousBalanceCents: number,
  newBalanceCents: number,
  now = new Date()
): Promise<"incremental" | "revalued"> {
  const delta = newBalanceCents - previousBalanceCents;
  if (
    !Number.isSafeInteger(previousBalanceCents) ||
    !Number.isSafeInteger(newBalanceCents) ||
    !Number.isSafeInteger(delta)
  ) {
    await syncDailyPortfolioSnapshot(db, userId, now);
    return "revalued";
  }

  const dateKey = getChicagoDateKey(now);
  const snapshot = await db.financialDailySnapshot.findUnique({
    where: { userId_dateKey: { userId, dateKey } },
    select: {
      id: true,
      balanceCents: true,
      collectionValueCents: true,
      sealedValueCents: true,
      closingNetWorthCents: true,
      netWorthCents: true,
      valuationVersion: true,
    },
  });

  const consistent = snapshot &&
    snapshot.valuationVersion >= 2 &&
    snapshot.balanceCents === previousBalanceCents &&
    snapshot.netWorthCents === snapshot.closingNetWorthCents &&
    snapshot.closingNetWorthCents ===
      snapshot.balanceCents + snapshot.collectionValueCents + snapshot.sealedValueCents;

  if (consistent) {
    // Compare-and-swap guards against another writer revaluing this snapshot
    // between the read and update. Increment only the cash/net worth fields;
    // leave the day's opening balance and all noncash components untouched.
    const updated = await db.financialDailySnapshot.updateMany({
      where: {
        id: snapshot.id,
        valuationVersion: snapshot.valuationVersion,
        balanceCents: previousBalanceCents,
        collectionValueCents: snapshot.collectionValueCents,
        sealedValueCents: snapshot.sealedValueCents,
        closingNetWorthCents: snapshot.closingNetWorthCents,
      },
      data: {
        balanceCents: newBalanceCents,
        closingNetWorthCents: { increment: delta },
        netWorthCents: { increment: delta },
      },
    });
    if (updated.count === 1) return "incremental";
  }

  // First claim of a new day or preexisting snapshot mismatch: full valuation.
  await syncDailyPortfolioSnapshot(db, userId, now);
  return "revalued";
}
