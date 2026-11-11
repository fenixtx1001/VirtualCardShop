import assert from "node:assert/strict";
import test from "node:test";
import { syncDailyPortfolioSnapshot } from "./portfolio";

type Db = Parameters<typeof syncDailyPortfolioSnapshot>[0];
const date = new Date("2026-11-11T19:30:00Z");

async function verifyFullSnapshot(revisions: Array<bigint | null>) {
  const original = process.env.VCS_PORTFOLIO_GROUPED_VALUES;
  const oldFastFlag = process.env.VCS_PACK_PORTFOLIO_DELTA;
  process.env.VCS_PORTFOLIO_GROUPED_VALUES = "0";
  process.env.VCS_PACK_PORTFOLIO_DELTA = "1";
  let reads = 0;
  let saved: { create: { cardPriceRevision?: bigint | null } } | null = null;
  const db = {
    $queryRaw: async () => {
      const version = revisions[reads++];
      return version == null ? [] : [{ revision: version }];
    },
    user: { findUnique: async () => ({ balanceCents: 1000 }) },
    cardOwnership: { findMany: async () => [] },
    gradingOrder: { findMany: async () => [] },
    sealedInventory: { aggregate: async () => ({ _sum: { costBasisCents: 0 } }) },
    financialDailySnapshot: {
      findUnique: async () => null,
      findFirst: async () => null,
      upsert: async (args: { create: { cardPriceRevision?: bigint | null } }) => {
        saved = args;
        return args;
      },
    },
  } as unknown as Db;
  try {
    await syncDailyPortfolioSnapshot(db, "collector", date);
    return { reads, saved: saved as unknown as { create: { cardPriceRevision?: bigint | null } } };
  } finally {
    if (original === undefined) delete process.env.VCS_PORTFOLIO_GROUPED_VALUES;
    else process.env.VCS_PORTFOLIO_GROUPED_VALUES = original;
    if (oldFastFlag === undefined) delete process.env.VCS_PACK_PORTFOLIO_DELTA;
    else process.env.VCS_PACK_PORTFOLIO_DELTA = oldFastFlag;
  }
}

test("a full valuation certifies its snapshot only when price revision stays stable", async () => {
  const result = await verifyFullSnapshot([BigInt(7), BigInt(7)]);
  assert.equal(result.reads, 2);
  assert.equal(result.saved.create.cardPriceRevision, BigInt(7));
});

test("price change DURING full valuation stamps NULL, so no fast pack can trust it", async () => {
  const result = await verifyFullSnapshot([BigInt(7), BigInt(8)]);
  assert.equal(result.saved.create.cardPriceRevision, null);
});

test("missing/unavailable catalog guard never certifies a financial snapshot", async () => {
  const result = await verifyFullSnapshot([null, null]);
  assert.equal(result.saved.create.cardPriceRevision, null);
});
