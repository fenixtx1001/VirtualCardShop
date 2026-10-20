// Regression checks for the VCS Registry weighting model.
// Run: npx tsx scripts/test-graded-registry.ts
import assert from "node:assert/strict";
import { REGISTRY_GRADE_POINTS, registryValueWeight, registrySetMultiplier, registryPointsForGrade, calculateRegistryRevealImpact } from "../src/lib/graded-registry";

assert.deepEqual([6,7,8,9,10].map(g => REGISTRY_GRADE_POINTS[g]), [0,1,10,30,100]);
assert.equal(registryValueWeight(.5,.5), 1);
assert.equal(registryValueWeight(5,.5), 3);
assert.equal(registryValueWeight(50,.5), 5);
assert.equal(registryValueWeight(500,.5), 7);
assert.equal(registryValueWeight(.01,.5), 1);
assert.equal(registryValueWeight(100000,.01), 8);
assert.ok(Math.abs(registrySetMultiplier(30) - Math.sqrt(.3)) < 1e-9);
assert.ok(Math.abs(registrySetMultiplier(500) - Math.sqrt(5)) < 1e-9);
assert.equal(registrySetMultiplier(0), .35);
assert.equal(registrySetMultiplier(100000), 4);
assert.ok(REGISTRY_GRADE_POINTS[10] > 3 * REGISTRY_GRADE_POINTS[9]);

const setRawValues = [0.5, 0.5, 0.5, 0.5];
const input = {
  productSetId: "test-set",
  previousBestGrade: 0,
  revealedGrades: [8],
  cardRawValue: 0.5,
  setRawValues,
};
const grade8Points = registryPointsForGrade(8, 0.5, 0.5, .35);
const grade9Points = registryPointsForGrade(9, 0.5, 0.5, .35);
const grade10Points = registryPointsForGrade(10, 0.5, 0.5, .35);

const firstReveal = calculateRegistryRevealImpact(input);
assert.equal(firstReveal.previousBestGrade, 0);
assert.equal(firstReveal.newBestGrade, 8);
assert.equal(firstReveal.previousPoints, 0);
assert.equal(firstReveal.newPoints, grade8Points);
assert.equal(firstReveal.pointsGained, grade8Points);
assert.equal(firstReveal.isUpgrade, true);

const improved = calculateRegistryRevealImpact({
  ...input, previousBestGrade: 8, revealedGrades: [6, 7, 9, 9],
});
assert.equal(improved.newBestGrade, 9);
assert.equal(improved.pointsGained, grade9Points - grade8Points);

const duplicate = calculateRegistryRevealImpact({
  ...input, previousBestGrade: 9, revealedGrades: [7, 9],
});
assert.equal(duplicate.pointsGained, 0);
assert.equal(duplicate.isUpgrade, false);
assert.equal(duplicate.newBestGrade, 9);

const lower = calculateRegistryRevealImpact({
  ...input, previousBestGrade: 10, revealedGrades: [6, 7, 8, 9],
});
assert.equal(lower.pointsGained, 0);
assert.equal(lower.previousPoints, grade10Points);

const firstSix = calculateRegistryRevealImpact({ ...input, revealedGrades: [6] });
assert.equal(firstSix.pointsGained, 0);
assert.equal(firstSix.newBestGrade, 6);

const mixedCopies = calculateRegistryRevealImpact({
  ...input, previousBestGrade: 8, revealedGrades: [6, 8, 10],
});
assert.equal(mixedCopies.pointsGained, grade10Points - grade8Points);
assert.equal(mixedCopies.highestRevealedGrade, 10);

// No hard-coded awards: correcting the current card/set prices changes
// the points delta in the same manner as the Registry binder.
const repriced = calculateRegistryRevealImpact({
  ...input, previousBestGrade: 8,
  revealedGrades: [10],
  cardRawValue: 50,
  setRawValues: [0.5, 0.5, 0.5, 50],
});
assert.ok(repriced.pointsGained > 0);
assert.notEqual(repriced.pointsGained, mixedCopies.pointsGained);

assert.throws(() => calculateRegistryRevealImpact({
  ...input, revealedGrades: [0],
}), /at least one graded result/);

console.log("Registry scoring and mailer-reveal point deltas PASS");
