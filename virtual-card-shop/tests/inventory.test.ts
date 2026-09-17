import test from "node:test";
import assert from "node:assert/strict";
import {
  baseSets, defaultInventoryFilters, missingText, restoreInventoryFilters, visibleInventory,
  type InventoryProduct, type InventorySetProgress,
} from "../src/lib/inventory";

const set = (patch: Partial<InventorySetProgress> = {}): InventorySetProgress => ({
  productId: "baseball", productSetId: "base", name: "Base", isBase: true,
  level: 3, nextLevel: 4, totalCards: 100, cardsAtNext: 92, missingCopies: 8, ...patch,
});
const product = (id: string, patch: Partial<InventoryProduct> = {}): InventoryProduct => ({
  productId: id, packsOwned: 10, updatedAt: "2026-09-17T12:00:00Z", packPriceCents: 300,
  cardsPerPack: 4, packImageUrl: null, sport: "Baseball", year: 1996, brand: "Ultra", sets: [set()], ...patch,
});

test("next prestige text distinguishes missing cards from multiple missing copies", () => {
  assert.equal(missingText(set()), "8 cards needed");
  assert.equal(missingText(set({ cardsAtNext: 99, missingCopies: 1 })), "1 card needed");
  assert.equal(missingText(set({ missingCopies: 10 })), "10 copies across 8 cards");
  assert.equal(missingText(set({ cardsAtNext: 99, missingCopies: 4 })), "4 copies across 1 card");
});

test("base prestige includes level zero, keeps multiple base sets, and excludes inserts", () => {
  const first = set({ level: 0, nextLevel: 1, cardsAtNext: 0, missingCopies: 100 });
  const second = set({ productSetId: "series2", level: 2 });
  assert.deepEqual(baseSets(product("p", { sets: [first, second, set({ isBase: false, missingCopies: 1 })] })), [first, second]);
});

test("closest prestige uses base missing copies, not insert completion or percentages", () => {
  const rows = [
    product("insert-close", { sets: [set({ missingCopies: 20 }), set({ isBase: false, missingCopies: 1 })] }),
    product("base-close", { sets: [set({ missingCopies: 2, cardsAtNext: 0 })] }),
    product("unknown", { sets: [] }),
    product("empty", { packsOwned: 0, sets: [set({ missingCopies: 1 })] }),
  ];
  assert.deepEqual(visibleInventory(rows, { ...defaultInventoryFilters, sort: "prestige", hideEmpty: false }).map((r) => r.productId), ["base-close", "insert-close", "unknown", "empty"]);
  assert.equal(rows[0].productId, "insert-close", "sorting does not mutate the loaded inventory");
});

test("closest prestige uses the closest named base set for multi-base products", () => {
  const rows = [product("a", { sets: [set({ missingCopies: 6 })] }), product("b", { sets: [set({ missingCopies: 40 }), set({ productSetId: "base2", missingCopies: 3 })] })];
  assert.equal(visibleInventory(rows, { ...defaultInventoryFilters, sort: "prestige" })[0].productId, "b");
});

test("sport and search use real metadata, including soccer and friendly product names", () => {
  const rows = [product("2000_Topps_Premier_Gold", { sport: "Soccer" }), product("baseball")];
  assert.equal(visibleInventory(rows, { ...defaultInventoryFilters, sport: "Soccer", query: "Premier Gold" }).length, 1);
  assert.equal(visibleInventory(rows, { ...defaultInventoryFilters, sport: "Hockey" }).length, 0);
  assert.equal(visibleInventory(rows, { ...defaultInventoryFilters, query: "ultra" }).length, 2);
});

test("empty products stay hidden by default and user preferences restore defensively", () => {
  assert.equal(visibleInventory([product("empty", { packsOwned: 0 })], defaultInventoryFilters).length, 0);
  assert.deepEqual(restoreInventoryFilters({ sort: "__proto__", query: 4, hideEmpty: "yes" }), defaultInventoryFilters);
  assert.deepEqual(restoreInventoryFilters({ sort: "prestige", query: "Ultra", sport: "Soccer", hideEmpty: false }), { sort: "prestige", query: "Ultra", sport: "Soccer", hideEmpty: false });
});
