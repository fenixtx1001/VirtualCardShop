import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

type CleanupBundle = {
  product?: { id?: unknown };
  productSets?: Array<{ id?: unknown }>;
  obsoleteProductSetIds?: unknown;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function hasNonNullPricing(productSet: {
  commonPrice: number | null;
  semiStarPrice: number | null;
  unlistedStarPrice: number | null;
  star1Price: number | null;
  star2Price: number | null;
  star3Price: number | null;
}) {
  return [
    productSet.commonPrice,
    productSet.semiStarPrice,
    productSet.unlistedStarPrice,
    productSet.star1Price,
    productSet.star2Price,
    productSet.star3Price,
  ].some((value) => value != null);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const bundleArg = args.find((arg) => !arg.startsWith("--"));

  if (!bundleArg) {
    throw new Error(
      "Usage: npx tsx scripts/cleanup-obsolete-product-sets.ts <bundle.json> [--apply]"
    );
  }

  const bundlePath = path.resolve(process.cwd(), bundleArg);
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as CleanupBundle;
  const productId = requiredText(bundle.product?.id, "product.id");

  if (!Array.isArray(bundle.obsoleteProductSetIds)) {
    throw new Error("Bundle does not define obsoleteProductSetIds.");
  }

  const obsoleteIds = bundle.obsoleteProductSetIds.map((value, index) =>
    requiredText(value, `obsoleteProductSetIds[${index}]`)
  );

  const currentIds = new Set(
    (bundle.productSets ?? []).map((productSet, index) =>
      requiredText(productSet.id, `productSets[${index}].id`)
    )
  );

  for (const id of obsoleteIds) {
    if (currentIds.has(id)) {
      throw new Error(`Obsolete ProductSet ${id} is still present in productSets.`);
    }
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, released: true },
  });

  const plans: Array<{
    productSetId: string;
    cards: number;
    action: string;
    blockedReasons: string;
  }> = [];

  const safeToDelete: string[] = [];

  for (const id of obsoleteIds) {
    const productSet = await prisma.productSet.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        name: true,
        commonPrice: true,
        semiStarPrice: true,
        unlistedStarPrice: true,
        star1Price: true,
        star2Price: true,
        star3Price: true,
        defaultGradeability: true,
        _count: { select: { prestiges: true } },
        cards: {
          select: {
            id: true,
            cardNumber: true,
            quantityOwned: true,
            bookValue: true,
            frontImageUrl: true,
            backImageUrl: true,
            position: true,
            gradeabilityOverride: true,
            shopInventory: { select: { id: true } },
            _count: {
              select: {
                ownerships: true,
                gradingOrders: true,
                favoritedBy: true,
                shopOffers: true,
                shopTransactions: true,
                ripBoxCards: true,
                ripBoxGradingOrders: true,
                auctions: true,
                saleHistory: true,
              },
            },
          },
        },
      },
    });

    if (!productSet) {
      plans.push({
        productSetId: id,
        cards: 0,
        action: "already-absent",
        blockedReasons: "",
      });
      continue;
    }

    if (productSet.productId !== productId) {
      throw new Error(
        `Refusing cleanup: ${id} belongs to ${productSet.productId}, not ${productId}.`
      );
    }

    const reasons: string[] = [];

    if (product?.released) reasons.push("product is released");
    if (hasNonNullPricing(productSet)) reasons.push("ProductSet has pricing");
    if (String(productSet.defaultGradeability) !== "COMMON") {
      reasons.push(`defaultGradeability=${productSet.defaultGradeability}`);
    }
    if (productSet._count.prestiges > 0) {
      reasons.push(`${productSet._count.prestiges} prestige record(s)`);
    }

    const protectedCards = productSet.cards.filter((card) => {
      const relationCount = Object.values(card._count).reduce(
        (sum, value) => sum + Number(value),
        0
      );

      return (
        card.quantityOwned !== 0 ||
        card.bookValue !== 0 ||
        Boolean(card.frontImageUrl) ||
        Boolean(card.backImageUrl) ||
        Boolean(card.position) ||
        card.gradeabilityOverride != null ||
        card.shopInventory != null ||
        relationCount > 0
      );
    });

    if (protectedCards.length > 0) {
      reasons.push(
        `${protectedCards.length} card(s) contain ownership/activity/images/value/overrides`
      );
    }

    if (reasons.length > 0) {
      plans.push({
        productSetId: id,
        cards: productSet.cards.length,
        action: "BLOCKED",
        blockedReasons: reasons.join("; "),
      });
    } else {
      plans.push({
        productSetId: id,
        cards: productSet.cards.length,
        action: apply ? "delete" : "safe-to-delete",
        blockedReasons: "",
      });
      safeToDelete.push(id);
    }
  }

  console.log("[obsolete-product-sets] plan", {
    bundle: path.relative(process.cwd(), bundlePath),
    productId,
    mode: apply ? "APPLY" : "DRY_RUN",
    obsoleteProductSets: obsoleteIds.length,
  });
  console.table(plans);

  const blocked = plans.filter((plan) => plan.action === "BLOCKED");
  if (blocked.length > 0) {
    throw new Error(
      `Cleanup blocked for ${blocked.length} ProductSet(s). No obsolete ProductSets were deleted.`
    );
  }

  if (!apply) {
    console.log(
      "[obsolete-product-sets] dry run complete; rerun with --apply to delete only the verified-safe obsolete ProductSets."
    );
    return;
  }

  for (const id of safeToDelete) {
    const legacySetId = `PS__${id}`;

    const result = await prisma.$transaction(async (tx) => {
      const deletedCards = await tx.card.deleteMany({
        where: { productSetId: id },
      });

      await tx.productSet.delete({ where: { id } });

      const remainingLegacyCards = await tx.card.count({
        where: { setId: legacySetId },
      });

      let deletedLegacySet = 0;
      if (remainingLegacyCards === 0) {
        const deleted = await tx.set.deleteMany({ where: { id: legacySetId } });
        deletedLegacySet = deleted.count;
      }

      return {
        deletedCards: deletedCards.count,
        deletedLegacySet,
      };
    });

    console.log("[obsolete-product-sets] deleted", {
      productSetId: id,
      cards: result.deletedCards,
      legacySetDeleted: result.deletedLegacySet === 1,
    });
  }

  console.log("[obsolete-product-sets] complete");
}

main()
  .catch((error) => {
    console.error("[obsolete-product-sets] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
