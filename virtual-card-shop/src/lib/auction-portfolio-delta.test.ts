import assert from "node:assert/strict";
import test from "node:test";
import { trySyncAuctionPortfolioDelta } from "./portfolio";

type Db = Parameters<typeof trySyncAuctionPortfolioDelta>[0];
const when = new Date("2026-11-11T15:00:00Z");

function fakeDb(input: {
  previousBalance: number;
  collectionValue: number;
  sealedValue?: number;
  cashDelta: number;
  collectionDelta: number;
  missingSnapshot?: boolean;
  updateCount?: number;
}) {
  const sealed = input.sealedValue ?? 0;
  const oldNetWorth = input.previousBalance + input.collectionValue + sealed;
  const snapshot = input.missingSnapshot ? null : {
    id: 7,
    valuationVersion: 2,
    balanceCents: input.previousBalance,
    collectionValueCents: input.collectionValue,
    sealedValueCents: sealed,
    closingNetWorthCents: oldNetWorth,
    netWorthCents: oldNetWorth,
  };
  let scanCount = 0;
  let updateCount = 0;
  const db = {
    user: {
      findUnique: async () => ({ balanceCents: input.previousBalance + input.cashDelta }),
    },
    financialDailySnapshot: {
      findUnique: async () => snapshot,
      updateMany: async (args: {
        where: { balanceCents: number; collectionValueCents: number; closingNetWorthCents: number };
        data: {
          balanceCents: number;
          collectionValueCents: { increment: number };
          closingNetWorthCents: { increment: number };
          netWorthCents: { increment: number };
        };
      }) => {
        updateCount++;
        assert.equal(args.where.balanceCents, input.previousBalance);
        assert.equal(args.where.collectionValueCents, input.collectionValue);
        assert.equal(args.where.closingNetWorthCents, oldNetWorth);
        assert.equal(args.data.balanceCents, input.previousBalance + input.cashDelta);
        assert.equal(args.data.collectionValueCents.increment, input.collectionDelta);
        assert.equal(args.data.closingNetWorthCents.increment, input.cashDelta + input.collectionDelta);
        assert.equal(args.data.netWorthCents.increment, input.cashDelta + input.collectionDelta);
        return { count: input.updateCount ?? 1 };
      },
    },
    cardOwnership: { findMany: async () => { scanCount++; throw new Error("Full valuation on fast path"); } },
  } as unknown as Db;
  return { db, scans: () => scanCount, updates: () => updateCount };
}

test("sold card updates seller net worth without a full collection scan", async () => {
  const { db, scans, updates } = fakeDb({
    previousBalance: 1000, collectionValue: 5000,
    sealedValue: 1000, cashDelta: 400, collectionDelta: -250,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "seller", {
    balanceDeltaCents: 400, collectionDeltaCents: -250,
  }, when), true);
  assert.equal(scans(), 0);
  assert.equal(updates(), 1);
});

test("human buyer receives card and pays cash with consistent net worth delta", async () => {
  const { db } = fakeDb({
    previousBalance: 5000, collectionValue: 1000,
    cashDelta: -400, collectionDelta: 250,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "buyer", {
    balanceDeltaCents: -400, collectionDeltaCents: 250,
  }, when), true);
});

test("unsold auctions do not create collection-value changes", async () => {
  const { db } = fakeDb({
    previousBalance: 1000, collectionValue: 3000,
    cashDelta: 0, collectionDelta: 0,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "seller", {
    balanceDeltaCents: 0, collectionDeltaCents: 0,
  }, when), true);
});

test("missing daily snapshot triggers a full revaluation in the caller", async () => {
  const { db, updates } = fakeDb({
    previousBalance: 1000, collectionValue: 5000,
    cashDelta: 400, collectionDelta: -250, missingSnapshot: true,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "seller", {
    balanceDeltaCents: 400, collectionDeltaCents: -250,
  }, when), false);
  assert.equal(updates(), 0);
});

test("compare-and-swap conflict returns false so the caller revalues", async () => {
  const { db } = fakeDb({
    previousBalance: 1000, collectionValue: 5000,
    cashDelta: 400, collectionDelta: -250, updateCount: 0,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "seller", {
    balanceDeltaCents: 400, collectionDeltaCents: -250,
  }, when), false);
});

test("negative collection valuation cannot be applied incrementally", async () => {
  const { db, updates } = fakeDb({
    previousBalance: 1000, collectionValue: 100,
    cashDelta: 400, collectionDelta: -250,
  });
  assert.equal(await trySyncAuctionPortfolioDelta(db, "seller", {
    balanceDeltaCents: 400, collectionDeltaCents: -250,
  }, when), false);
  assert.equal(updates(), 0);
});
