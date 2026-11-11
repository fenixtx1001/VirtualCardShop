import assert from "node:assert/strict";
import test from "node:test";
import { calculateGradedValueCents } from "./grading";
import { getCollectionValueCents } from "./portfolio";

type Db = Parameters<typeof getCollectionValueCents>[0];

test("grouped ownership preserves exact raw, graded and pending values", async () => {
  const db = {
    $queryRaw: async (query: unknown) => {
      void query;
      if (++calls === 1) return [
        { bookValue: 0.50, grade: 0, quantity: 4n },
        { bookValue: 0.50, grade: 9, quantity: 2n },
        { bookValue: 20.0, grade: 10, quantity: 1n },
      ];
      return [{ bookValue: 0.25, grade: 0, quantity: 3n }];
    },
  } as unknown as Db;
  let calls = 0;
  const expected = 50 * 4 +
    calculateGradedValueCents({ rawBookValueCents: 50, gradeability: "COMMON", grade: 9 }) * 2 +
    calculateGradedValueCents({ rawBookValueCents: 2000, gradeability: "COMMON", grade: 10 }) +
    25 * 3;
  assert.equal(await getCollectionValueCents(db, "collector"), expected);
  assert.equal(calls, 2);
});

test("SQL problems safely fall back to original copy-by-copy valuation", async () => {
  const db = {
    $queryRaw: async () => { throw new Error("simulated database error"); },
    cardOwnership: {
      findMany: async () => [{
        quantity: 3, grade: 0,
        card: { bookValue: 0.75, gradeabilityOverride: null, productSet: null },
      }],
    },
    gradingOrder: {
      findMany: async () => [{
        quantity: 2, card: { bookValue: 0.25 },
      }],
    },
  } as unknown as Db;
  assert.equal(await getCollectionValueCents(db, "collector"), 3 * 75 + 2 * 25);
});

test("unsafe quantities fall back instead of altering financial totals", async () => {
  let queries = 0;
  const db = {
    $queryRaw: async () => ++queries === 1
      ? [{ bookValue: 0.50, grade: 0, quantity: BigInt(Number.MAX_SAFE_INTEGER) + 5n }]
      : [],
    cardOwnership: {
      findMany: async () => [{ quantity: 1, grade: 0, card: { bookValue: 0.50 } }],
    },
    gradingOrder: { findMany: async () => [] },
  } as unknown as Db;
  assert.equal(await getCollectionValueCents(db, "collector"), 50);
});
