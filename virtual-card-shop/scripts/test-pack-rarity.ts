/**
 * Deterministic, database-free smoke tests for opt-in subset rarity.
 * Run: npx tsx scripts/test-pack-rarity.ts
 */
import assert from "node:assert/strict";
import {
  drawPackHits,
  effectiveHitProbabilities,
  parsePackRarityConfig,
  validateRarityInventory,
} from "../src/lib/pack-rarity";

assert.equal(parsePackRarityConfig(null), null, "Legacy sets remain opt-out");
const config = parsePackRarityConfig({
  version: 1,
  fallback: { productSetId: "Finest_Base", subset: "Bronze" },
  hits: [
    { productSetId: "Finest_Base", subset: "Silver", oddsPerPack: 4 },
    { productSetId: "Finest_Base", subset: "Gold", oddsPerPack: 24 },
    { productSetId: "Finest_Refractors", subset: "Bronze", oddsPerPack: 12 },
  ],
});
assert(config);
validateRarityInventory(config, [
  { id: "Finest_Base", isBase: true, oddsPerPack: null,
    subsets: ["Bronze", "Silver", "Gold"] },
  { id: "Finest_Refractors", isBase: false, oddsPerPack: null,
    subsets: ["Bronze"] },
]);
assert.throws(() => validateRarityInventory(config, [
  { id: "Finest_Base", isBase: true, oddsPerPack: null,
    subsets: ["Bronze", "Silver", "Gold", "Secret"] },
  { id: "Finest_Refractors", isBase: false, oddsPerPack: null,
    subsets: ["Bronze"] },
]), /unreachable/);
assert.throws(() => validateRarityInventory(config, [
  { id: "Finest_Base", isBase: true, oddsPerPack: 4,
    subsets: ["Bronze", "Silver", "Gold"] },
  { id: "Finest_Refractors", isBase: false, oddsPerPack: null,
    subsets: ["Bronze"] },
]), /whole-set odds/);

assert.throws(() => parsePackRarityConfig({
  version: 1,
  fallback: { productSetId: "A", subset: "Bronze" },
  hits: [
    { productSetId: "A", subset: "Bronze", oddsPerPack: 3 },
  ],
}), /Duplicate/);

let state = 123456;
function rand() {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return state / 4294967296;
}
const count = [0, 0, 0];
const simulations = 100_000;
for (let i = 0; i < simulations; i++) {
  for (const hit of drawPackHits(config.hits, 4, rand)) {
    count[config.hits.indexOf(hit)]++;
  }
}
for (const [index, hit] of config.hits.entries()) {
  const observed = count[index] / simulations;
  const expected = 1 / hit.oddsPerPack;
  assert(Math.abs(observed - expected) < 0.005,
    "Frequency drift: " + hit.subset + " expected " + expected + " got " + observed);
}

const allHits = [
  { productSetId: "X", subset: "A", oddsPerPack: 1 },
  { productSetId: "X", subset: "B", oddsPerPack: 1 },
  { productSetId: "X", subset: "C", oddsPerPack: 1 },
];
const effective = effectiveHitProbabilities(allHits, 2);
for (const p of effective) {
  assert(Math.abs(p - 2 / 3) < 1e-12, "Uniform cap EV must match real draw");
}
let capped = [0, 0, 0];
for (let i = 0; i < simulations; i++) {
  const selected = drawPackHits(allHits, 2, rand);
  assert.equal(selected.length, 2);
  for (const item of selected) capped[allHits.indexOf(item)]++;
}
for (let i = 0; i < 3; i++) {
  assert(Math.abs(capped[i] / simulations - effective[i]) < 0.008,
    "Post-cap simulated odds differ from pricing math");
}
assert.deepEqual(
  effectiveHitProbabilities(config.hits, 4),
  config.hits.map(r => 1 / r.oddsPerPack),
  "With fewer hit groups than slots, no cap should affect rarity"
);
console.log(
  "PASS: opt-out, config integrity, unreachable-card protection, " +
  "100k-pack rarity rates, capped fairness and EV probability matching"
);
