// Grading Desk shuffle: offline, deterministic, no DB writes or grading reveals.
// Run: npx tsx scripts/test-grading-shuffle.ts
import assert from "node:assert/strict";
import { shuffleReadyMailerIds } from "../src/lib/grading-shuffle";

const original = Array.from({ length: 127 }, (_, i) => i + 1000);
const copy = [...original];
const seed = 123456789;
const first = shuffleReadyMailerIds(original, seed);

assert.deepEqual(original, copy, "Never mutate the loaded order list");
assert.equal(first.length, original.length);
assert.deepEqual([...first].sort((a, b) => a - b), original,
  "Every Ready mailer must appear exactly once");
assert.deepEqual(shuffleReadyMailerIds([...original].reverse(), seed), first,
  "Stable shuffle must not depend on the database's ID order");
assert.deepEqual(shuffleReadyMailerIds(original, seed), first,
  "The same seed must give identical order across pagination/refetch");

// Pagination must partition the ALL-ready shuffled list, not independently
// shuffle each 25-order page (which would trap you on the oldest 25).
const pages = [];
for (let page = 1; page <= 6; page++) {
  pages.push(first.slice((page - 1) * 25, page * 25));
}
assert.deepEqual(pages.flat(), first, "All pages must reassemble the same global shuffle");
assert.deepEqual(pages.map(p => p.length), [25, 25, 25, 25, 25, 2]);
assert.equal(new Set(pages.flat()).size, 127, "No duplicates across pages");
assert.ok(first.slice(0, 25).some(id => id >= 1025),
  "First shuffled page must be able to contain mailers beyond the original first page");

// Same seed still works after opening/removing a mailer. No duplicates.
const afterReveal = shuffleReadyMailerIds(original.filter(id => id !== first[0]), seed);
assert.equal(afterReveal.length, 126);
assert.equal(new Set(afterReveal).size, 126);
assert.ok(!afterReveal.includes(first[0]));

// New shuffle seed changes the order, while not changing the set of IDs.
const reshuffled = shuffleReadyMailerIds(original, 987654321);
assert.notDeepEqual(first, reshuffled);
assert.deepEqual([...reshuffled].sort((a, b) => a - b), original);

// Search results can be shuffled without bringing back excluded mailers.
const filtered = original.filter(id => id % 4 === 0);
const filteredOrder = shuffleReadyMailerIds(filtered, seed);
assert.deepEqual([...filteredOrder].sort((a, b) => a - b), filtered);

// One or zero results cannot break navigation.
assert.deepEqual(shuffleReadyMailerIds([], seed), []);
assert.deepEqual(shuffleReadyMailerIds([99], seed), [99]);

console.log("Grading ready-mailer shuffle PASS");
console.log("All 127 orders covered across 6 pages with stable seeded ordering.");
console.log("Distinct shuffle, filtering, removal/refetch, 0/1 results: PASS");
console.log("No database writes, grading results exposed, or bubble mailers opened.");
