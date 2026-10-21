// Offline, read-only regression coverage for Checklist's best revealed grade.
// Run: npx tsx scripts/test-checklist-best-grade.ts
import assert from "node:assert/strict";
import { highestRevealedGradeByCard } from "../src/lib/checklist-best-grade";

const rows = [
  { userId: "me", cardId: 1, grade: 0, quantity: 12 },
  { userId: "me", cardId: 1, grade: 7, quantity: 4 },
  { userId: "me", cardId: 1, grade: 8, quantity: 2 },
  { userId: "me", cardId: 1, grade: 10, quantity: 0 }, // sold out
  { userId: "friend", cardId: 1, grade: 10, quantity: 1 },
  { userId: "me", cardId: 2, grade: 0, quantity: 9 }, // raw only
  { userId: "me", cardId: 3, grade: 10, quantity: 1 },
  { userId: "me", cardId: 3, grade: 9, quantity: 5 },
  { userId: "me", cardId: 4, grade: 6, quantity: 1 },
  { userId: "me", cardId: 5, grade: 10, quantity: -1 },
  { userId: "me", cardId: 5, grade: 8, quantity: 2 },
  { userId: "me", cardId: 6, grade: 11, quantity: 3 }, // invalid
];

const mine = highestRevealedGradeByCard(rows, "me");
assert.equal(mine.get(1), 8, "Only currently owned grades can count");
assert.equal(mine.has(2), false, "Unslabbed raw-only cards have no badge");
assert.equal(mine.get(3), 10, "Highest positive graded quantity wins");
assert.equal(mine.get(4), 6, "A grade 6 is still shown as Best 6");
assert.equal(mine.get(5), 8, "Never count a non-positive owned quantity");
assert.equal(mine.has(6), false, "Never accept invalid grades");
assert.equal(mine.size, 4);

const other = highestRevealedGradeByCard(rows, "friend");
assert.deepEqual([...other], [[1, 10]], "Compare mode must use selected collector");

assert.equal(highestRevealedGradeByCard([], "me").size, 0);
console.log("Checklist best revealed grades PASS");
console.log("Raw only, grades 6–10, positive ownership, sold copies and compare mode verified.");
console.log("No database writes or grading orders involved.");
