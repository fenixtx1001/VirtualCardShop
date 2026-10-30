import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";
import {
  parsePackRarityConfig,
  validateRarityInventory,
} from "../src/lib/pack-rarity";
import { calculateProductPackPricing } from "../src/lib/pack-pricing";

const PRODUCT_ID = "1997_Finest_Baseball";
const CHECKS = [
  { key: "base", count: 350, tiers: { Bronze: 200, Silver: 100, Gold: 50 } },
  { key: "refractors", count: 350, tiers: { Bronze: 200, Silver: 100, Gold: 50 } },
  { key: "embossed", count: 150, tiers: { Silver: 100, Gold: 50 } },
  { key: "embossed_refractors", count: 150, tiers: { Silver: 100, Gold: 50 } },
] as const;

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    include: { productSets: true },
  });
  if (!product) throw new Error("1997 Finest draft not imported");
  if (product.released) throw new Error("STOP: 1997 Finest must remain unreleased");
  if (product.cardsPerPack !== 4) throw new Error("Finest needs four-card VCS packs");
  const rules = parsePackRarityConfig(product.packRarityConfig);
  if (!rules || rules.hits.length !== 9) {
    throw new Error("Expected exactly 9 active Finest rarity hit groups");
  }
  const expected = new Set(CHECKS.map(check => PRODUCT_ID + "_" + check.key));
  if (product.productSets.length !== CHECKS.length ||
      product.productSets.some(ps => !expected.has(ps.id))) {
    throw new Error("Unexpected Finest ProductSets; expected four intact checklists");
  }
  const inventory = [];
  for (const check of CHECKS) {
    const id = PRODUCT_ID + "_" + check.key;
    const set = product.productSets.find(s => s.id === id);
    if (!set) throw new Error("Missing ProductSet " + id);
    const cards = await prisma.card.findMany({
      where: { productSetId: id },
      select: { cardNumber: true, subset: true },
    });
    if (cards.length !== check.count) {
      throw new Error(id + " expected " + check.count + " cards; found " + cards.length);
    }
    const actual: Record<string, number> = {};
    for (const card of cards) {
      actual[String(card.subset)] = (actual[String(card.subset)] ?? 0) + 1;
    }
    if (JSON.stringify(Object.entries(actual).sort()) !==
        JSON.stringify(Object.entries(check.tiers).sort())) {
      throw new Error(id + " tier counts do not match: " + JSON.stringify(actual));
    }
    if (new Set(cards.map(c => c.cardNumber)).size !== cards.length) {
      throw new Error(id + " has duplicate card identities");
    }
    inventory.push({
      id: set.id,
      isBase: set.isBase,
      oddsPerPack: set.oddsPerPack,
      subsets: cards.map(c => c.subset),
    });
  }
  validateRarityInventory(rules, inventory);
  const pricing = await calculateProductPackPricing(PRODUCT_ID);
  if (!pricing || !Number.isFinite(pricing.evPerPack)) {
    throw new Error("Weighted pack EV calculation failed");
  }
  if (pricing.inserts.length !== 9) {
    throw new Error("Priced rarity hits mismatch configured groups");
  }
  console.log("=== FINEST RARITY VERIFICATION PASSED ===");
  console.log("Base completion: 350 cards, Bronze 200 / Silver 100 / Gold 50");
  console.log("Collector ProductSets: 4; total collectible cards: 1,000");
  console.log("Pack rules: 9 active tier groups; rarity-aware EV: $" +
    pricing.evPerPack.toFixed(2));
  console.log("Product status: UNRELEASED");
}
main().catch(error => {
  console.error("Verification FAILED:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
