import test from "node:test";
import assert from "node:assert/strict";
import { productPrices, selectPromotions, shopDateKey, previousDateKey, type PromotionDay } from "../src/lib/shop/pricing";
import { buildShelves, summarizeProgress, type ShopProduct } from "../src/lib/shop/discovery";

const ids = Array.from({ length: 40 }, (_, n) => `set-${n}`);
const base = { id: "set-0", packPriceCents: 999, packsPerBox: 24 };
const day: PromotionDay = { dateKey: "2026-09-16", productId: "set-0", saleProductIds: ["set-1", "set-2", "set-3", "set-4", "set-5"] };

test("five sales and one daily deal, disjoint and repeat-free over 400 days", () => {
  let yesterday: PromotionDay | null = null;
  for (let i = 0; i < 400; i++) {
    const key = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    const next = selectPromotions(ids, key, yesterday);
    const todayIds = [next.productId, ...next.saleProductIds];
    assert.equal(next.saleProductIds.length, 5); assert.equal(new Set(todayIds).size, 6);
    for (const old of [yesterday?.productId, ...(yesterday?.saleProductIds ?? [])]) assert.ok(!todayIds.includes(old ?? ""));
    assert.deepEqual(next, selectPromotions([...ids].reverse(), key, yesterday));
    yesterday = next;
  }
});
test("tiny catalog avoids repeating instead of inventing more promotions", () => {
  const previous = selectPromotions(ids.slice(0, 8), "2026-09-15", null);
  const next = selectPromotions(ids.slice(0, 8), "2026-09-16", previous);
  assert.equal(next.saleProductIds.length, 1);
  assert.equal(selectPromotions([], day.dateKey, day).productId, null);
});
test("legacy daily deal is retained when eligible; yesterday's deal cannot repeat", () => {
  assert.equal(selectPromotions(ids, day.dateKey, null, "set-7").productId, "set-7");
  assert.notEqual(selectPromotions(ids, "2026-09-17", day, "set-0").productId, "set-0");
});
test("promotions apply separately to normal pack and already-discounted box prices", () => {
  const daily = productPrices(base, day);
  assert.equal(daily.standardBoxPriceCents, 17982);
  assert.equal(daily.effectivePackPriceCents, 849);
  assert.equal(daily.effectiveBoxPriceCents, 15285);
  const sale = productPrices({ ...base, id: "set-1" }, day);
  assert.equal(sale.effectivePackPriceCents, 949);
  assert.equal(sale.effectiveBoxPriceCents, 17083);
  const normal = productPrices({ ...base, id: "set-20" }, day);
  assert.equal(normal.effectivePackPriceCents, 999);
  assert.equal(normal.effectiveBoxPriceCents, 17982);
});
test("daily deal wins over malformed overlapping sale membership; missing box remains unavailable", () => {
  const prices = productPrices({ ...base, packsPerBox: null }, { ...day, saleProductIds: [base.id] });
  assert.equal(prices.isSale, false); assert.equal(prices.discountBps, 1500); assert.equal(prices.effectiveBoxPriceCents, null);
});
test("Chicago midnight and DST boundaries do not follow UTC midnight", () => {
  assert.equal(shopDateKey(new Date("2026-09-16T04:59:59Z")), "2026-09-15");
  assert.equal(shopDateKey(new Date("2026-09-16T05:00:00Z")), "2026-09-16");
  assert.equal(shopDateKey(new Date("2026-01-16T05:59:59Z")), "2026-01-15");
  assert.equal(shopDateKey(new Date("2026-01-16T06:00:00Z")), "2026-01-16");
  assert.equal(previousDateKey("2026-03-09"), "2026-03-08");
  assert.equal(previousDateKey("2026-11-02"), "2026-11-01");
  assert.equal(previousDateKey("2026-01-01"), "2025-12-31");
});
const products: ShopProduct[] = ids.map((id, n) => ({
  id, year: 1975 + n, sport: n % 2 ? "Baseball" : "Football", brand: "Test",
  packImageUrl: null, boxImageUrl: null, packsPerBox: 24, cardsPerPack: 4, productSetsCount: 1,
  released: true, isNewProduct: false, ...productPrices({ ...base, id, packPriceCents: 100 * (n + 1) }, day),
}));
test("base completion excludes inserts; prestige uses distinct set progress", () => {
  const progress = summarizeProgress([
    { productId: "set-0", productSetId: "base", name: "Base", isBase: true, totalCards: 100, ownedCards: 90, level: 0, nextLevel: 1, cardsAtNext: 90, missingCopies: 10 },
    { productId: "set-0", productSetId: "insert", name: "Gold", isBase: false, totalCards: 10, ownedCards: 10, level: 5, nextLevel: 6, cardsAtNext: 9, missingCopies: 3 },
  ]);
  assert.equal(progress["set-0"].baseTotal, 100); assert.equal(progress["set-0"].baseOwned, 90);
  assert.equal(progress["set-0"].prestige?.nextLevel, 6); assert.equal(progress["set-0"].prestige?.missingCopies, 3);
  const shelves = buildShelves(products, progress, day.dateKey);
  assert.ok(shelves.some((s) => s.kind)); assert.equal(shelves[0].id, "sales");
  assert.equal(shelves[0].products.length, 5); assert.ok(!shelves[0].products.some((p) => p.isDailyDeal));
});
test("discovery stays deterministic, rotates its category mix, and has no fake personalized rows", () => {
  const today = buildShelves(products, {}, day.dateKey);
  assert.deepEqual(today, buildShelves(products, {}, day.dateKey));
  assert.notDeepEqual(today.map((s) => s.id), buildShelves(products, {}, "2026-09-17").map((s) => s.id));
  assert.ok(today.every((s) => !s.kind && s.products.length > 0));
  assert.equal(new Set(today.map((s) => s.id)).size, today.length);
});
