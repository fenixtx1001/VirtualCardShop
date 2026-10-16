/**
 * Deterministic, database-free smoke tests for opt-in subset rarity.
 * Run: npx tsx scripts/test-pack-rarity.ts
 */
import assert from "node:assert/strict";
import { canManagePackRarity } from "../src/lib/pack-rarity-admin";
import {
  drawPackHits,
  effectiveHitProbabilities,
  parsePackRarityConfig,
  replaceBaseSubsetOdds,
  validateRarityInventory,
} from "../src/lib/pack-rarity";

assert.equal(canManagePackRarity("owner@example.com", undefined), false,
  "Admin access must fail closed without configured allowlist");
assert.equal(canManagePackRarity(null, "owner@example.com"), false,
  "Anonymous users cannot edit pack odds");
assert.equal(canManagePackRarity("collector@example.com", "owner@example.com"), false,
  "Signed-in collectors cannot change pack odds");
assert.equal(canManagePackRarity(" OWNER@Example.com ", "other@example.com, owner@example.com"), true,
  "Named admins can edit pack odds, case-insensitively");
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

// An admin Base edit must retain historical non-Base rarity groups verbatim.
const finestStyle = parsePackRarityConfig({
  version: 1,
  fallback: { productSetId: "BASE", subset: "Bronze" },
  hits: [
    { productSetId: "BASE", subset: "Silver", oddsPerPack: 4 },
    { productSetId: "BASE", subset: "Gold", oddsPerPack: 24 },
    { productSetId: "REFRACTORS", subset: "Gold", oddsPerPack: 288 },
    { productSetId: "EMBOSSED", subset: "Silver", oddsPerPack: 16 },
  ],
});
assert(finestStyle);
const edited = replaceBaseSubsetOdds(finestStyle, "BASE", "Bronze", [
  { subset: "Silver", oddsPerPack: 5 },
  { subset: "Gold", oddsPerPack: 30 },
]);
assert.deepEqual(edited.hits.filter(r => r.productSetId !== "BASE"),
  finestStyle.hits.filter(r => r.productSetId !== "BASE"),
  "Base odds UI must not change Refractors/Embossed odds");
assert.deepEqual(edited.hits.filter(r => r.productSetId === "BASE").map(r => r.oddsPerPack),
  [5, 30], "Base edits must save their actual new odds");
assert.deepEqual(finestStyle.hits.slice(0, 2).map(r => r.oddsPerPack),
  [4, 24], "Original fetched config must remain immutable");

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
for (const [index, p] of effectiveHitProbabilities(config.hits, 4).entries()) {
  assert(Math.abs(p - 1 / config.hits[index].oddsPerPack) < 1e-12,
    "With fewer hit groups than slots, no cap should affect rarity");
}
console.log(
  "PASS: opt-out, config integrity, unreachable-card protection, " +
  "100k-pack rarity rates, admin-only authorization, safe Base-only edits, capped fairness and EV probability matching"
);
