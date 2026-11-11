import assert from "node:assert/strict";
import test from "node:test";
import { trySyncPackPortfolioDelta } from "./portfolio";

type PortfolioDb = Parameters<typeof trySyncPackPortfolioDelta>[0];
const testDate = new Date("2026-11-11T17:00:00Z");
// Exercise opt-in path in unit tests; production defaults to OFF.
process.env.VCS_PACK_PORTFOLIO_DELTA = "1";

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
  // Revision changes whenever an admin reprices, imports or removes cards.
  catalogRevision?: bigint;
  snapshotRevision?: bigint | null;
  catalogMissing?: boolean;
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
    cardPriceRevision: input.snapshotRevision === undefined
      ? BigInt(7) : input.snapshotRevision,
  };
  let updated = 0;
  let payload: unknown = null;
  let revisionLocks = 0;
  const db = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      if (query.strings?.join("").includes("FOR UPDATE")) revisionLocks++;
      return input.catalogMissing
        ? []
        : [{ revision: input.catalogRevision ?? BigInt(7) }];
    },
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
  return {
    db, updated: () => updated, payload: () => payload,
    revisionLocks: () => revisionLocks,
  };
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
  assert.equal(f.revisionLocks(), 1, "price revision row must be locked");
  const update = f.payload() as any;
  assert.equal(update.where.cardPriceRevision, BigInt(7));
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
    { catalogMissing: true },
    { catalogRevision: BigInt(8) }, // Price edited after last full valuation
    { snapshotRevision: null }, // Pre-migration/unverified snapshot
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

test("feature flag disables the incremental path and preserves fallback", async () => {
  const f = makeFixture({
    balance: 100, collection: 300, sealed: 500,
    gained: 50, consumed: 20,
  });
  process.env.VCS_PACK_PORTFOLIO_DELTA = "0";
  try {
    assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
      collectionDeltaCents: 50, sealedDeltaCents: -20,
    }, testDate), false);
    assert.equal(f.updated(), 0);
  } finally {
    process.env.VCS_PACK_PORTFOLIO_DELTA = "1";
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


test("price changes after a snapshot force full revaluation before another pack", async () => {
  const stale = makeFixture({
    balance: 1200, collection: 10000, sealed: 2000,
    gained: 300, consumed: 500,
    catalogRevision: BigInt(17), snapshotRevision: BigInt(16),
  });
  assert.equal(await trySyncPackPortfolioDelta(stale.db, "collector", {
    collectionDeltaCents: 300, sealedDeltaCents: -500,
  }, testDate), false);
  assert.equal(stale.updated(), 0);

  // After the ordinary full-valuation fallback stamps the new catalog
  // revision, the following pack may use the safe incremental update.
  const revalued = makeFixture({
    balance: 1200, collection: 12000, sealed: 1500,
    gained: 100, consumed: 300,
    catalogRevision: BigInt(17), snapshotRevision: BigInt(17),
  });
  assert.equal(await trySyncPackPortfolioDelta(revalued.db, "collector", {
    collectionDeltaCents: 100, sealedDeltaCents: -300,
  }, testDate), true);
  assert.equal(revalued.updated(), 1);
});

test("concurrent snapshot update loses compare-and-swap and falls back safely", async () => {
  const f = makeFixture({
    balance: 1200, collection: 5000, sealed: 2000,
    gained: 250, consumed: 300, conflictingUpdate: true,
    catalogRevision: BigInt(19), snapshotRevision: BigInt(19),
  });
  assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: 250, sealedDeltaCents: -300,
  }, testDate), false);
  assert.equal(f.updated(), 1);
  assert.equal(f.revisionLocks(), 1);
});

test("a failed revision read cannot accidentally enable the fast path", async () => {
  const f = makeFixture({
    balance: 1200, collection: 5000, sealed: 2000,
    gained: 250, consumed: 300, catalogMissing: true,
  });
  assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
    collectionDeltaCents: 250, sealedDeltaCents: -300,
  }, testDate), false);
  assert.equal(f.updated(), 0);
});


test("fast accounting is disabled by default if no opt-in was supplied", async () => {
  const f = makeFixture({
    balance: 1200, collection: 5000, sealed: 2000,
    gained: 250, consumed: 300,
  });
  delete process.env.VCS_PACK_PORTFOLIO_DELTA;
  try {
    assert.equal(await trySyncPackPortfolioDelta(f.db, "collector", {
      collectionDeltaCents: 250, sealedDeltaCents: -300,
    }, testDate), false);
    assert.equal(f.updated(), 0);
  } finally {
    process.env.VCS_PACK_PORTFOLIO_DELTA = "1";
  }
});
