import assert from "node:assert/strict";
import test from "node:test";
import { trySyncPackPortfolioDelta } from "./portfolio";

type PortfolioDb = Parameters<typeof trySyncPackPortfolioDelta>[0];
const testDate = new Date("2026-11-11T17:00:00Z");

function makeFixture(input: {
  balance: number;
  collection: number;
  sealed: number;
  gained: number;
  consumed: number;
  version?: number;
  snapshotMissing?: boolean;
  conflictingUpdate?: boolean;
  staleBalance?: boolean;
}) {
  const net = input.balance + input.collection + input.sealed;
  const snapshot = input.snapshotMissing ? null : {
    id: 21,
    balanceCents: input.staleBalance ? input.balance - 1 : input.balance,
    collectionValueCents: input.collection,
    sealedValueCents: input.sealed,
    closingNetWorthCents: net,
    netWorthCents: net,
    valuationVersion: input.version ?? 2,
  };
  let updated = 0;
  let payload: unknown = null;
  const db = {
    user: { findUnique: async () => ({ balanceCents: input.balance }) },
    financialDailySnapshot: {
      findUnique: async () => snapshot,
      updateMany: async (args: any) => {
        updated++;
        payload = args;
        return { count: input.conflictingUpdate ? 0 : 1 };
      },
    },
  } as unknown as PortfolioDb;
  return { db, updated: () => updated, payload: () => payload };
}

test("pack opening adds raw card values and removes sealed cost basis atomically", async () => {
  const f = makeFixture({
    balance: 1200, collection: 25000, sealed: 4000,
    gained: 275, consumed: 420,
  });
  const ok = await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: 275, sealedDeltaCents: -420,
  }, testDate);
  assert.equal(ok, true);
  assert.equal(f.updated(), 1);
  const update = f.payload() as any;
  assert.deepEqual(update.data.collectionValueCents, { increment: 275 });
  assert.deepEqual(update.data.sealedValueCents, { increment: -420 });
  assert.deepEqual(update.data.netWorthCents, { increment: -145 });
  assert.deepEqual(update.data.closingNetWorthCents, { increment: -145 });
  assert.equal(update.data.openingNetWorthCents, undefined);
});

test("zero sealed basis (free pack) still adds the pulled card value", async () => {
  const f = makeFixture({
    balance: 0, collection: 200, sealed: 0, gained: 50, consumed: 0,
  });
  assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: 50, sealedDeltaCents: 0,
  }, testDate), true);
});

test("missing, older, and conflicting snapshots use the original full-value fallback", async () => {
  for (const overrides of [
    { snapshotMissing: true },
    { version: 1 },
    { staleBalance: true },
    { conflictingUpdate: true },
  ]) {
    const f = makeFixture({
      balance: 100, collection: 300, sealed: 500,
      gained: 50, consumed: 20, ...overrides,
    });
    assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
      collectionDeltaCents: 50, sealedDeltaCents: -20,
    }, testDate), false);
  }
});

test("invalid or impossible pack value cannot corrupt a snapshot", async () => {
  const f = makeFixture({
    balance: 100, collection: 300, sealed: 10, gained: 100, consumed: 100,
  });
  assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: 100, sealedDeltaCents: -100,
  }, testDate), false);
  assert.equal(f.updated(), 0);
  assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: Number.NaN, sealedDeltaCents: 0,
  }, testDate), false);
});
