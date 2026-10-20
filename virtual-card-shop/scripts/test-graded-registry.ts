// Regression checks for the VCS Registry weighting model.
// Run: npx tsx scripts/test-graded-registry.ts
import assert from "node:assert/strict";
import { REGISTRY_GRADE_POINTS, registryValueWeight, registrySetMultiplier } from "../src/lib/graded-registry";

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
console.log("Registry scoring rules PASS");
