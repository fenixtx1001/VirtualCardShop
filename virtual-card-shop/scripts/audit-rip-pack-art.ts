// Read-only verification of the production-data pack-art discrepancy.
// Confirms the same Product.packImageUrl is used for Inventory and Rip.
// Run: npx tsx scripts/audit-rip-pack-art.ts
import assert from "node:assert/strict";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { resolveOpenPackMeta } from "../src/lib/open-pack-meta";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const prisma = new PrismaClient();

async function main() {
  const affectedProductId = "1992_Ultra_Football";

  const storedProduct = await prisma.product.findUnique({
    where: { id: affectedProductId },
    select: { id: true, packImageUrl: true },
  });

  if (!storedProduct) {
    console.log("Specific affected product not present in this database:", affectedProductId);
    console.log("Continuing with other products with pack art.");
  }

  const examples = await prisma.product.findMany({
    where: { packImageUrl: { not: null } },
    select: { id: true, packImageUrl: true },
    orderBy: { id: "asc" },
    take: 20,
  });

  const toCheck = [
    ...(storedProduct ? [storedProduct] : []),
    ...examples.filter(product => product.id !== affectedProductId),
  ];

  let confirmed = 0;
  for (const product of toCheck) {
    const meta = await resolveOpenPackMeta(product.id, {
      findProductById: id => prisma.product.findUnique({
        where: { id },
        select: { id: true, packImageUrl: true },
      }),
      findLegacySetById: id => prisma.productSet.findUnique({
        where: { id },
        select: {
          id: true,
          product: { select: { id: true, packImageUrl: true } },
        },
      }),
    });

    assert.equal(meta?.productId, product.id, "Wrong product resolved: " + product.id);
    assert.equal(
      meta?.packImageUrl,
      product.packImageUrl,
      "Inventory/Rip image mismatch: " + product.id,
    );
    if (product.packImageUrl) confirmed++;
    if (product.id === affectedProductId) {
      console.log("Affected product:", affectedProductId);
      console.log("Inventory pack artwork configured:", Boolean(product.packImageUrl));
      console.log("Rip resolves the exact same URL:", meta?.packImageUrl === product.packImageUrl);
    }
  }

  console.log("=== RIP / INVENTORY PACK ART AUDIT ===");
  console.log("Product records verified:", toCheck.length);
  console.log("With non-empty pack artwork:", confirmed);
  console.log("Pack URLs returned match Inventory exactly: YES");
  console.log("No database writes and no packs opened.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
