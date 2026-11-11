import assert from "node:assert/strict";
import test from "node:test";
import { computeRegistry } from "./graded-registry";

function card(id: number, bookValue: number) {
  return {
    id,
    cardNumber: String(id),
    player: "Test Player " + id,
    team: "Test",
    bookValue,
    frontImageUrl: null,
    backImageUrl: null,
    productSetId: "test",
  };
}
const cards = [card(1, 0.05), card(2, 1.5), card(3, 20), card(4, 1)];
const owned = [
  { userId: "a", cardId: 1, grade: 7, quantity: 2, gradedAt: null },
  { userId: "a", cardId: 1, grade: 9, quantity: 1, gradedAt: null },
  { userId: "a", cardId: 3, grade: 10, quantity: 1, gradedAt: null },
  { userId: "b", cardId: 2, grade: 8, quantity: 1, gradedAt: null },
  { userId: "b", cardId: 4, grade: 6, quantity: 3, gradedAt: null },
];

test("community fast path preserves every scoring field and sort order", () => {
  const full = computeRegistry(cards, owned);
  const fast = computeRegistry(cards, owned, { includeCardDetails: false });
  assert.deepEqual(fast.standings, full.standings);
  assert.equal(fast.maximum, full.maximum);
  assert.equal(fast.medianValue, full.medianValue);
  assert.equal(fast.setValue, full.setValue);
  assert.equal(fast.multiplier, full.multiplier);
  assert.equal(fast.totalCards, full.totalCards);
  assert.equal(fast.cardsByUser.size, 0);
  assert.equal(full.cardsByUser.get("a")?.length, cards.length);
});

test("empty community and unowned sets remain equivalent", () => {
  const full = computeRegistry(cards, []);
  const fast = computeRegistry(cards, [], { includeCardDetails: false });
  assert.deepEqual(fast.standings, full.standings);
  assert.equal(fast.maximum, full.maximum);
});

test("fast path still uses only the best grade for duplicate copies", () => {
  const score = computeRegistry(cards, owned, { includeCardDetails: false });
  assert.equal(score.standings.find(s => s.userId === "a")?.owned, 2);
});
