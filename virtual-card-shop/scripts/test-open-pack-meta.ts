// Regression tests for the Inventory → Rip pack-art mismatch.
// No database calls, no image downloads, no pack opens.
// Run: npx tsx scripts/test-open-pack-meta.ts
import assert from "node:assert/strict";
import { resolveOpenPackMeta } from "../src/lib/open-pack-meta";

async function main() {
  const calls: string[] = [];
  const product = {
    id: "1992_Ultra_Football",
    packImageUrl: "https://example.test/r2/1992-ultra-football-pack.webp",
  };
  const metadata = await resolveOpenPackMeta(product.id, {
    findProductById: async id => { calls.push("product:" + id); return id === product.id ? product : null; },
    findLegacySetById: async id => { calls.push("set:" + id); return null; },
  });
  assert.equal(metadata?.productId, product.id);
  assert.equal(metadata?.packImageUrl, product.packImageUrl);
  assert.equal(metadata?.displayName, "1992 Ultra Football");
  assert.deepEqual(calls, ["product:1992_Ultra_Football"],
    "Existing product must resolve immediately, without assuming any set-ID match");

  // Backwards compatibility for an old link that happened to send a ProductSet ID.
  const legacy = await resolveOpenPackMeta("1992_Ultra_Football_base", {
    findProductById: async () => null,
    findLegacySetById: async id => id === "1992_Ultra_Football_base"
      ? { id, product } : null,
  });
  assert.equal(legacy?.productId, product.id);
  assert.equal(legacy?.packImageUrl, product.packImageUrl);

  const unknown = await resolveOpenPackMeta("UNKNOWN", {
    findProductById: async () => null,
    findLegacySetById: async () => null,
  });
  assert.equal(unknown, null);

  const missingArt = await resolveOpenPackMeta("has_no_image", {
    findProductById: async id => ({ id, packImageUrl: null }),
    findLegacySetById: async () => { throw Error("Must not query set"); },
  });
  assert.equal(missingArt?.packImageUrl, null,
    "Genuinely missing art stays missing; no fabricated image or template");

  console.log("Rip metadata now uses Product.packImageUrl like Inventory: PASS");
  console.log("1992 Ultra Football, old ProductSet links, unknown IDs and no-art fallback: PASS");
  console.log("No database writes, image fetches, or pack-ripping operations.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
