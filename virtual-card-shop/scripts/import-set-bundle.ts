import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Gradeability, Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/prisma";

type ProductSetKind = "BASE" | "INSERT" | "PARALLEL";

type BundleCard = {
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
};

type CsvCardRow = {
  setKey?: string;
  cardNumber?: string;
  player?: string;
  team?: string;
  subset?: string;
  variant?: string;
};

type BundleProductSet = {
  key: string;
  id: string;
  name?: string | null;
  kind: ProductSetKind;
  oddsPerPack?: number | null;
  defaultGradeability?: Gradeability;
  sourceUrl?: string | null;
  expectedCards: number;
  deriveCardsFrom?: string | null;
  derivedVariant?: string | null;
  notes?: string | null;
  pricing?: {
    commonPrice?: number | null;
    semiStarPrice?: number | null;
    unlistedStarPrice?: number | null;
    star1Price?: number | null;
    star2Price?: number | null;
    star3Price?: number | null;
  };
};

type SetBundle = {
  schemaVersion: 2;
  status: "DRAFT";
  source?: Record<string, unknown>;
  decisions?: Record<string, unknown>;
  product: {
    id: string;
    year?: number | null;
    brand?: string | null;
    sport?: string | null;
    cardsPerPack?: number | null;
    packsPerBox?: number | null;
    packPriceCents?: number;
    autoPackPricing?: boolean;
    packImageUrl?: string | null;
    boxImageUrl?: string | null;
    released: false;
  };
  review?: {
    teamData?: string | null;
    packImage?: string | null;
    cardImages?: string | null;
    pricing?: string | null;
    release?: string | null;
  };
  cardsFile: string;
  productSets: BundleProductSet[];
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function isChecklistCard(card: BundleCard) {
  return /checklist/i.test(card.player) || /checklist/i.test(card.subset ?? "");
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function flagsForKind(kind: ProductSetKind) {
  if (kind === "BASE") return { isBase: true, isInsert: false };
  if (kind === "INSERT") return { isBase: false, isInsert: true };

  // ProductSet predates explicit parallel semantics. Pack ripping treats any
  // non-base ProductSet with oddsPerPack as a hit pool, so PARALLEL can remain
  // neither base nor insert while still behaving correctly in packs.
  return { isBase: false, isInsert: false };
}

function validateBundle(input: unknown): SetBundle {
  const bundle = input as SetBundle;

  if (bundle?.schemaVersion !== 2) {
    throw new Error("Unsupported bundle schemaVersion; expected 2.");
  }
  if (bundle.status !== "DRAFT") {
    throw new Error("Set bundles must be DRAFT.");
  }
  if (bundle.product?.released !== false) {
    throw new Error("Safety check failed: imported Products must start unreleased.");
  }

  requiredText(bundle.product.id, "product.id");
  requiredText(bundle.cardsFile, "cardsFile");

  if (!Array.isArray(bundle.productSets) || bundle.productSets.length === 0) {
    throw new Error("Bundle must contain at least one Product Set.");
  }

  const keys = new Set<string>();
  const ids = new Set<string>();
  let baseCount = 0;

  for (const [index, productSet] of bundle.productSets.entries()) {
    const key = requiredText(productSet.key, `productSets[${index}].key`);
    const id = requiredText(productSet.id, `productSets[${index}].id`);

    if (!["BASE", "INSERT", "PARALLEL"].includes(productSet.kind)) {
      throw new Error(`Invalid Product Set kind for ${key}: ${productSet.kind}`);
    }
    if (keys.has(key)) throw new Error(`Duplicate Product Set key: ${key}`);
    if (ids.has(id)) throw new Error(`Duplicate Product Set id: ${id}`);

    keys.add(key);
    ids.add(id);
    if (productSet.kind === "BASE") baseCount += 1;

    if (!Number.isInteger(productSet.expectedCards) || productSet.expectedCards <= 0) {
      throw new Error(`Product Set ${key} must have a positive expectedCards count.`);
    }

    if (
      productSet.oddsPerPack != null &&
      (!Number.isInteger(productSet.oddsPerPack) || productSet.oddsPerPack <= 0)
    ) {
      throw new Error(`Product Set ${key} oddsPerPack must be a positive integer or null.`);
    }
  }

  if (baseCount !== 1) {
    throw new Error(`Bundle must contain exactly one BASE Product Set; found ${baseCount}.`);
  }

  for (const productSet of bundle.productSets) {
    if (productSet.deriveCardsFrom && !keys.has(productSet.deriveCardsFrom)) {
      throw new Error(
        `Product Set ${productSet.key} derives from unknown key ${productSet.deriveCardsFrom}.`
      );
    }
    if (productSet.deriveCardsFrom === productSet.key) {
      throw new Error(`Product Set ${productSet.key} cannot derive from itself.`);
    }
  }

  return bundle;
}

async function loadCsvCards(bundlePath: string, bundle: SetBundle) {
  const cardsPath = path.resolve(path.dirname(bundlePath), bundle.cardsFile);
  const raw = await readFile(cardsPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvCardRow[];

  const bySetKey = new Map<string, BundleCard[]>();

  for (const [index, row] of rows.entries()) {
    const setKey = requiredText(row.setKey, `CSV row ${index + 2} setKey`);
    const cardNumber = requiredText(row.cardNumber, `CSV row ${index + 2} cardNumber`);
    const player = requiredText(row.player, `CSV row ${index + 2} player`);

    if (!bundle.productSets.some((productSet) => productSet.key === setKey)) {
      throw new Error(`CSV row ${index + 2} references unknown setKey ${setKey}.`);
    }

    const card: BundleCard = {
      cardNumber,
      player,
      team: row.team?.trim() || null,
      subset: row.subset?.trim() || null,
      variant: row.variant?.trim() || null,
      bookValue: 0,
    };

    const cards = bySetKey.get(setKey) ?? [];
    cards.push(card);
    bySetKey.set(setKey, cards);
  }

  return { cardsPath, bySetKey };
}

function resolveProductSetCards(
  bundle: SetBundle,
  explicitCards: Map<string, BundleCard[]>
) {
  const resolved = new Map<string, BundleCard[]>();
  const resolving = new Set<string>();
  const byKey = new Map(bundle.productSets.map((productSet) => [productSet.key, productSet]));

  const resolve = (key: string): BundleCard[] => {
    const existing = resolved.get(key);
    if (existing) return existing;
    if (resolving.has(key)) {
      throw new Error(`Circular deriveCardsFrom chain detected at ${key}.`);
    }

    const productSet = byKey.get(key);
    if (!productSet) throw new Error(`Unknown Product Set key ${key}.`);

    resolving.add(key);

    let cards: BundleCard[];
    if (productSet.deriveCardsFrom) {
      const sourceCards = resolve(productSet.deriveCardsFrom);
      cards = sourceCards.map((card) => ({
        ...card,
        subset: card.subset,
        variant: productSet.derivedVariant?.trim() || card.variant,
      }));
    } else {
      cards = (explicitCards.get(key) ?? []).map((card) => ({ ...card }));
    }

    resolving.delete(key);

    const seen = new Set<string>();
    for (const card of cards) {
      if (seen.has(card.cardNumber)) {
        throw new Error(`Duplicate card number ${card.cardNumber} in Product Set ${key}.`);
      }
      seen.add(card.cardNumber);
    }

    if (cards.length !== productSet.expectedCards) {
      throw new Error(
        `Product Set ${key} expected ${productSet.expectedCards} cards but resolved ${cards.length}.`
      );
    }

    resolved.set(key, cards);
    return cards;
  };

  for (const productSet of bundle.productSets) {
    resolve(productSet.key);
  }

  return resolved;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const bundleArg = args.find((arg) => !arg.startsWith("--"));

  if (!bundleArg) {
    throw new Error(
      "Usage: npm run import:set-bundle -- <bundle.json> [--apply]"
    );
  }

  const bundlePath = path.resolve(process.cwd(), bundleArg);
  const parsed = JSON.parse(await readFile(bundlePath, "utf8"));
  const bundle = validateBundle(parsed);
  const csv = await loadCsvCards(bundlePath, bundle);
  const cardsByKey = resolveProductSetCards(bundle, csv.bySetKey);

  const isBaseball = bundle.product.sport?.trim().toLowerCase() === "baseball";
  const missingTeams: string[] = [];

  if (isBaseball) {
    for (const productSet of bundle.productSets) {
      const cards = cardsByKey.get(productSet.key) ?? [];
      for (const card of cards) {
        if (!isChecklistCard(card) && !card.team?.trim()) {
          missingTeams.push(`${productSet.key} #${card.cardNumber} ${card.player}`);
        }
      }
    }

    if (bundle.review?.teamData === "COMPLETE" && missingTeams.length > 0) {
      throw new Error(
        `teamData is COMPLETE but ${missingTeams.length} non-checklist cards are missing teams. Example: ${missingTeams
          .slice(0, 8)
          .join(", ")}`
      );
    }

    if (apply && bundle.review?.teamData !== "COMPLETE") {
      throw new Error(
        `Baseball bundle apply blocked: review.teamData must be COMPLETE. Current value: ${
          bundle.review?.teamData ?? "missing"
        }.`
      );
    }
  }

  const existingProduct = await prisma.product.findUnique({
    where: { id: bundle.product.id },
    select: { id: true, released: true },
  });

  const plan = [];
  let totalCards = 0;
  let insertedCards = 0;
  let updatedCards = 0;

  for (const productSet of bundle.productSets) {
    const cards = cardsByKey.get(productSet.key) ?? [];
    const existingProductSet = await prisma.productSet.findUnique({
      where: { id: productSet.id },
      select: { id: true },
    });
    const existingCards = await prisma.card.findMany({
      where: { productSetId: productSet.id },
      select: { cardNumber: true },
    });

    const existingNumbers = new Set(existingCards.map((card) => card.cardNumber));
    const inserted = cards.filter((card) => !existingNumbers.has(card.cardNumber)).length;
    const updated = cards.length - inserted;

    totalCards += cards.length;
    insertedCards += inserted;
    updatedCards += updated;

    plan.push({
      key: productSet.key,
      productSetId: productSet.id,
      kind: productSet.kind,
      oddsPerPack: productSet.oddsPerPack ?? null,
      cards: cards.length,
      action: existingProductSet ? "update-preserving-pricing" : "create",
      insertedCards: inserted,
      updatedCards: updated,
      derivedFrom: productSet.deriveCardsFrom ?? null,
    });
  }

  console.log("[set-bundle] plan", {
    bundle: path.relative(process.cwd(), bundlePath),
    cardsFile: path.relative(process.cwd(), csv.cardsPath),
    mode: apply ? "APPLY" : "DRY_RUN",
    productId: bundle.product.id,
    product: existingProduct ? "update-preserving-release-and-pricing" : "create-unreleased",
    productSets: bundle.productSets.length,
    totalCards,
    insertedCards,
    updatedCards,
    teamData: bundle.review?.teamData ?? "missing",
    missingTeamCount: missingTeams.length,
  });
  console.table(plan);

  if (!apply) {
    console.log("[set-bundle] dry run complete; rerun with --apply to write.");
    return;
  }

  await prisma.product.upsert({
    where: { id: bundle.product.id },
    create: {
      id: bundle.product.id,
      year: bundle.product.year ?? null,
      brand: bundle.product.brand ?? null,
      sport: bundle.product.sport ?? null,
      cardsPerPack: bundle.product.cardsPerPack ?? null,
      packsPerBox: bundle.product.packsPerBox ?? null,
      packPriceCents: bundle.product.packPriceCents ?? 0,
      autoPackPricing: bundle.product.autoPackPricing ?? true,
      packImageUrl: bundle.product.packImageUrl ?? null,
      boxImageUrl: bundle.product.boxImageUrl ?? null,
      released: false,
    },
    update: {
      year: bundle.product.year ?? null,
      brand: bundle.product.brand ?? null,
      sport: bundle.product.sport ?? null,
      cardsPerPack: bundle.product.cardsPerPack ?? null,
      packsPerBox: bundle.product.packsPerBox ?? null,
    },
  });

  for (const productSet of bundle.productSets) {
    const cards = cardsByKey.get(productSet.key) ?? [];
    const flags = flagsForKind(productSet.kind);
    const pricing = productSet.pricing ?? {};
    const legacySetId = `PS__${productSet.id}`;

    await prisma.set.upsert({
      where: { id: legacySetId },
      create: {
        id: legacySetId,
        year: bundle.product.year ?? null,
        brand: bundle.product.brand ?? null,
        sport: bundle.product.sport ?? null,
        packPriceCents: 0,
      },
      update: {
        year: bundle.product.year ?? null,
        brand: bundle.product.brand ?? null,
        sport: bundle.product.sport ?? null,
      },
    });

    await prisma.productSet.upsert({
      where: { id: productSet.id },
      create: {
        id: productSet.id,
        productId: bundle.product.id,
        name: productSet.name ?? null,
        isBase: flags.isBase,
        isInsert: flags.isInsert,
        oddsPerPack: productSet.oddsPerPack ?? null,
        defaultGradeability:
          productSet.defaultGradeability ?? Gradeability.COMMON,
        commonPrice: pricing.commonPrice ?? null,
        semiStarPrice: pricing.semiStarPrice ?? null,
        unlistedStarPrice: pricing.unlistedStarPrice ?? null,
        star1Price: pricing.star1Price ?? null,
        star2Price: pricing.star2Price ?? null,
        star3Price: pricing.star3Price ?? null,
      },
      update: {
        productId: bundle.product.id,
        name: productSet.name ?? null,
        isBase: flags.isBase,
        isInsert: flags.isInsert,
        oddsPerPack: productSet.oddsPerPack ?? null,
        defaultGradeability:
          productSet.defaultGradeability ?? Gradeability.COMMON,
      },
    });

    for (const batch of chunks(cards, 75)) {
      const operations = batch.map((card) => {
        const createData: Prisma.CardUncheckedCreateInput = {
          setId: legacySetId,
          productSetId: productSet.id,
          cardNumber: card.cardNumber.trim(),
          player: card.player.trim(),
          team: card.team?.trim() || null,
          subset: card.subset?.trim() || null,
          variant: card.variant?.trim() || null,
          bookValue: card.bookValue ?? 0,
          quantityOwned: 0,
          frontImageUrl: null,
          backImageUrl: null,
        };

        const updateData: Prisma.CardUncheckedUpdateInput = {
          player: card.player.trim(),
          team: card.team?.trim() || null,
          subset: card.subset?.trim() || null,
          variant: card.variant?.trim() || null,
        };

        return prisma.card.upsert({
          where: {
            productSetId_cardNumber: {
              productSetId: productSet.id,
              cardNumber: card.cardNumber.trim(),
            },
          },
          create: createData,
          update: updateData,
        });
      });

      await prisma.$transaction(operations);
    }
  }

  console.log("[set-bundle] complete", {
    productId: bundle.product.id,
    productSets: bundle.productSets.length,
    cards: totalCards,
    released: existingProduct?.released ?? false,
    teamData: bundle.review?.teamData ?? "missing",
    pricingPreservedOnRerun: true,
    imagesPreservedOnRerun: true,
  });
}

main()
  .catch((error) => {
    console.error("[set-bundle] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
