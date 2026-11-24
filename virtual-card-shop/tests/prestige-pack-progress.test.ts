import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSetPrestigeSnapshot,
  isNeededForNextPrestige,
} from "../src/lib/prestige-pack-progress";

test("second Tim Salmon copy is NOT 'needed for Prestige x1' while first is being graded", () => {
  const snapshot = buildSetPrestigeSnapshot(
    [{ id: 79 }, { id: 80 }],
    [],
    [{ cardId: 79, quantity: 1 }]
  );

  assert.equal(snapshot.currentPrestigeLevel, 0);
  assert.equal(snapshot.nextPrestigeLevel, 1);
  assert.equal(snapshot.beforeQtyByCardId.get(79), 1);
  assert.deepEqual([...snapshot.missingForNextPrestigeBefore], [80]);
  assert.equal(
    isNeededForNextPrestige(1, 2, 1, snapshot.missingForNextPrestigeBefore.has(79)),
    false
  );
  // The actual missing card must still receive the correct Needed badge.
  assert.equal(
    isNeededForNextPrestige(0, 1, 1, snapshot.missingForNextPrestigeBefore.has(80)),
    true
  );
});

test("first-ever copy of an incomplete card IS needed", () => {
  const snapshot = buildSetPrestigeSnapshot([{ id: 79 }, { id: 80 }], [], []);
  assert.deepEqual([...snapshot.missingForNextPrestigeBefore], [79, 80]);
  assert.equal(isNeededForNextPrestige(0, 1, 1, true), true);
});

test("a grading copy plus a graded slab and raw copy are all counted once", () => {
  const snapshot = buildSetPrestigeSnapshot(
    [{ id: 79 }, { id: 80 }],
    [
      { cardId: 79, quantity: 1 }, // raw
      { cardId: 79, quantity: 1 }, // revealed graded slab
      { cardId: 80, quantity: 1 },
    ],
    [{ cardId: 79, quantity: 1 }] // still in grading, not revealed
  );
  assert.equal(snapshot.beforeQtyByCardId.get(79), 3);
  assert.equal(snapshot.currentPrestigeLevel, 1);
  assert.deepEqual([...snapshot.missingForNextPrestigeBefore], [80]);
  assert.equal(isNeededForNextPrestige(3, 4, 2, false), false);
});

test("at Prestige x1, a second needed copy for x2 still receives the badge", () => {
  const snapshot = buildSetPrestigeSnapshot(
    [{ id: 79 }, { id: 80 }],
    [{ cardId: 79, quantity: 1 }, { cardId: 80, quantity: 1 }],
    []
  );
  assert.equal(snapshot.currentPrestigeLevel, 1);
  assert.equal(snapshot.nextPrestigeLevel, 2);
  assert.equal(isNeededForNextPrestige(1, 2, 2, snapshot.missingForNextPrestigeBefore.has(79)), true);
});

test("copies in grading count for completion, and empty sets are handled", () => {
  const complete = buildSetPrestigeSnapshot(
    [{ id: 79 }, { id: 80 }],
    [{ cardId: 80, quantity: 1 }],
    [{ cardId: 79, quantity: 1 }]
  );
  assert.equal(complete.currentPrestigeLevel, 1);
  assert.equal(complete.nextPrestigeLevel, 2);
  const empty = buildSetPrestigeSnapshot([], [], []);
  assert.equal(empty.currentPrestigeLevel, 0);
  assert.equal(empty.totalCards, 0);
  assert.deepEqual([...empty.missingForNextPrestigeBefore], []);
});

test("unrelated card IDs and empty/zero counts cannot alter a set", () => {
  const snapshot = buildSetPrestigeSnapshot(
    [{ id: 79 }],
    [{ cardId: 79, quantity: 0 }, { cardId: 80, quantity: 10 }],
    [{ cardId: 81, quantity: 3 }]
  );
  assert.equal(snapshot.currentPrestigeLevel, 0);
  assert.equal(snapshot.beforeQtyByCardId.get(79), undefined);
});
