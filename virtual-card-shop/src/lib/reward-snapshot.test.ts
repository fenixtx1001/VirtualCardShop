import assert from "node:assert/strict";
import { test } from "node:test";
import { syncCashOnlyDailyPortfolioSnapshot } from "./portfolio";

type Db = Parameters<typeof syncCashOnlyDailyPortfolioSnapshot>[0];

const now = new Date("2026-10-14T18:00:00.000Z");
const userId = "test-reward-collector";
const dateKey = "2026-10-14";

test("normal reward uses one small guarded snapshot update without revaluing cards", async () => {
  let updateCount = 0;
  const snapshot = {
    id: 7,
    valuationVersion: 2,
    balanceCents: 10000,
    collectionValueCents: 450000,
    sealedValueCents: 25000,
    closingNetWorthCents: 485000,
    netWorthCents: 485000,
  };
  const db = {
    financialDailySnapshot: {
      findUnique: async () => snapshot,
      updateMany: async (args: {
        where: { balanceCents: number; closingNetWorthCents: number };
        data: { balanceCents: number; netWorthCents: { increment: number };
          closingNetWorthCents: { increment: number } };
      }) => {
        updateCount += 1;
        assert.equal(args.where.balanceCents, 10000);
        assert.equal(args.where.closingNetWorthCents, 485000);
        assert.equal(args.data.balanceCents, 11000);
        assert.equal(args.data.netWorthCents.increment, 1000);
        assert.equal(args.data.closingNetWorthCents.increment, 1000);
        return { count: 1 };
      },
    },
    cardOwnership: { findMany: () => { throw new Error("unexpected full valuation"); } },
  } as unknown as Db;

  const mode = await syncCashOnlyDailyPortfolioSnapshot(db, userId, 10000, 11000, now);
  assert.equal(mode, "incremental");
  assert.equal(updateCount, 1);
});

test("missing snapshot performs a full current-day valuation and preserves opening", async () => {
  let created: Record<string, unknown> = {};
  const db = {
    financialDailySnapshot: {
      findUnique: async () => null,
      findFirst: async () => null,
      upsert: async (args: { create: Record<string, unknown> }) => {
        created = args.create;
        return args.create;
      },
    },
    user: { findUnique: async () => ({ balanceCents: 11000 }) },
    cardOwnership: { findMany: async () => [] },
    gradingOrder: { findMany: async () => [] },
    sealedInventory: { aggregate: async () => ({ _sum: { costBasisCents: 0 } }) },
  } as unknown as Db;

  const mode = await syncCashOnlyDailyPortfolioSnapshot(db, userId, 10000, 11000, now);
  assert.equal(mode, "revalued");
  assert.ok(Object.keys(created).length);
  assert.equal(created.userId, userId);
  assert.equal(created.dateKey, dateKey);
  assert.equal(created.balanceCents, 11000);
  assert.equal(created.openingNetWorthCents, 11000);
  assert.equal(created.closingNetWorthCents, 11000);
});

test("compare-and-swap race falls back to valuation rather than applying stale net worth", async () => {
  let upserted = false;
  const db = {
    financialDailySnapshot: {
      findUnique: async () => ({
        id: 7,
        valuationVersion: 2,
        balanceCents: 10000,
        collectionValueCents: 5000,
        sealedValueCents: 0,
        closingNetWorthCents: 15000,
        netWorthCents: 15000,
      }),
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      upsert: async () => { upserted = true; },
    },
    user: { findUnique: async () => ({ balanceCents: 11000 }) },
    cardOwnership: { findMany: async () => [] },
    gradingOrder: { findMany: async () => [] },
    sealedInventory: { aggregate: async () => ({ _sum: { costBasisCents: 0 } }) },
  } as unknown as Db;
  assert.equal(await syncCashOnlyDailyPortfolioSnapshot(db, userId, 10000, 11000, now), "revalued");
  assert.equal(upserted, true);
});
