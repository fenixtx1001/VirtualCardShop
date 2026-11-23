import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatPublishedOdds, getPublishedOdds } from "./published-product-set-odds";

describe("Product Sets documented odds are display-only", () => {
  it("shows shared S1 hobby/retail 1:8 for Kid Gloves and Artistic Talents", () => {
    const kidGloves = getPublishedOdds("1998_Ultra_Baseball_kid_gloves");
    const artistic = getPublishedOdds("1998_Ultra_Baseball_artistic_talents");
    assert.ok(kidGloves);
    assert.ok(artistic);
    assert.equal(formatPublishedOdds(kidGloves), "S1 · H/R 1:8");
    assert.equal(formatPublishedOdds(artistic), "S1 · H/R 1:8");
  });

  it("displays different hobby and retail odds without merging them", () => {
    const notables = getPublishedOdds("1998_Ultra_Baseball_notables");
    assert.ok(notables);
    assert.equal(formatPublishedOdds(notables), "S2 · H 1:4 · R 1:6");
    assert.equal(formatPublishedOdds(getPublishedOdds("1998_Ultra_Baseball_diamond_immortals")!), "S2 · H 1:288 · R 1:412");
  });

  it("leaves unknown rates unknown rather than inventing pack odds", () => {
    assert.equal(getPublishedOdds("1998_Ultra_Baseball_masterpiece"), null);
    assert.equal(getPublishedOdds("1998_Ultra_Baseball_platinum_medallion"), null);
    assert.equal(getPublishedOdds("1998_Ultra_Baseball_base"), null);
    assert.equal(getPublishedOdds("2002_Ultra_Baseball_kid_gloves"), null);
  });

  it("keeps retail-only and hobby-only products distinguishable", () => {
    assert.equal(formatPublishedOdds(getPublishedOdds("1998_Ultra_Baseball_top_30")!), "S2 · R 1:1");
    assert.equal(formatPublishedOdds(getPublishedOdds("1998_Ultra_Baseball_millennium_men")!), "S2 · H 1:35");
  });
});
