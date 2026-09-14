import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Gradeability, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

type ManifestCard = {
  cardNumber: string;
  player: string;
  team?: string | null;
  subset?: string | null;
  variant?: string | null;
  bookValue?: number;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
};

type SetManifest = {
  schemaVersion: number;
  status: "DRAFT";
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
  productSet: {
    id: string;
    name?: string | null;
    isBase: boolean;
    isInsert: boolean;
    oddsPerPack?: number | null;
    defaultGradeability?: Gradeability;
    pricing?: {
      commonPrice?: number | null;
      semiStarPrice?: number | null;
      unlistedStarPrice?: number | null;
      star1Price?: number | null;
      star2Price?: number | null;
      star3Price?: number | null;
    };
  };
  review?: {
    teamData?: string | null;
    packImage?: string | null;
    cardImages?: string | null;
    pricing?: string | null;
    release?: string | null;
  };
  cards: ManifestCard[];
};

type TeamSidecar = {
  schemaVersion: 1;
  productSetId: string;
  status: "PENDING" | "COMPLETE";
  teams: Record<string, string | null>;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function isChecklistCard(card: ManifestCard) {
  return /checklist/i.test(card.player) || /checklist/i.test(card.subset ?? "");
}

function getTeamSidecarPath(manifestPath: string) {
  const extension = path.extname(manifestPath) || ".json";
  const base = extension
    ? manifestPath.slice(0, -extension.length)
    : manifestPath;
  return `${base}.teams${extension}`;
}

async function loadTeamSidecar(
  manifestPath: string,
  input: unknown
): Promise<{ manifest: SetManifest; teamSidecarPath: string | null }> {
  const manifest = input as SetManifest;
  const teamSidecarPath = getTeamSidecarPath(manifestPath);

  let raw: string;
  try {
    raw = await readFile(teamSidecarPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { manifest, teamSidecarPath: null };
    }
    throw error;
  }

  const sidecar = JSON.parse(raw) as TeamSidecar;

  if (sidecar?.schemaVersion !== 1) {
    throw new Error(
      `Unsupported team sidecar schemaVersion in ${path.basename(teamSidecarPath)}; expected 1.`
    );
  }
  if (sidecar.status !== "PENDING" && sidecar.status !== "COMPLETE") {
    throw new Error(
      `Invalid team sidecar status in ${path.basename(teamSidecarPath)}; expected PENDING or COMPLETE.`
    );
  }
  if (!sidecar.teams || typeof sidecar.teams !== "object" || Array.isArray(sidecar.teams)) {
    throw new Error(
      `Invalid team sidecar in ${path.basename(teamSidecarPath)}; teams must be an object.`
    );
  }
  if (sidecar.productSetId !== manifest?.productSet?.id) {
    throw new Error(
      `Team sidecar productSetId ${sidecar.productSetId} does not match manifest productSetId ${manifest?.productSet?.id}.`
    );
  }

  const cardsByNumber = new Map(
    (manifest.cards ?? []).map((card) => [card.cardNumber.trim(), card])
  );

  for (const [cardNumber, value] of Object.entries(sidecar.teams)) {
    if (!cardsByNumber.has(cardNumber)) {
      throw new Error(
        `Team sidecar contains unknown card number ${cardNumber}.`
      );
    }
    if (value !== null && typeof value !== "string") {
      throw new Error(
        `Team sidecar card ${cardNumber} must contain a team string or null.`
      );
    }
  }

  if (sidecar.status === "COMPLETE") {
    const missingMappings = (manifest.cards ?? []).filter(
      (card) => !Object.prototype.hasOwnProperty.call(sidecar.teams, card.cardNumber.trim())
    );
    if (missingMappings.length > 0) {
      const sample = missingMappings
        .slice(0, 8)
        .map((card) => `#${card.cardNumber} ${card.player}`)
        .join(", ");
      throw new Error(
        `Team sidecar is marked COMPLETE but is missing ${missingMappings.length} card mappings. Example: ${sample}`
      );
    }
  }

  for (const card of manifest.cards ?? []) {
    const cardNumber = card.cardNumber.trim();
    if (!Object.prototype.hasOwnProperty.call(sidecar.teams, cardNumber)) {
      continue;
    }

    const team = sidecar.teams[cardNumber];
    card.team = typeof team === "string" ? team.trim() || null : null;
  }

  manifest.review = {
    ...manifest.review,
    teamData: sidecar.status,
  };

  return { manifest, teamSidecarPath };
}

function validateManifest(input: unknown, apply: boolean): SetManifest {
  const manifest = input as SetManifest;

  if (manifest?.schemaVersion !== 1) {
    throw new Error("Unsupported manifest schemaVersion; expected 1.");
  }
  if (manifest?.status !== "DRAFT") {
    throw new Error("Set manifests must be DRAFT.");
  }
  if (manifest?.product?.released !== false) {
    throw new Error("Safety check failed: imported Products must start unreleased.");
  }

  requiredText(manifest.product.id, "product.id");
  requiredText(manifest.productSet.id, "productSet.id");

  if (!Array.isArray(manifest.cards) || manifest.cards.length === 0) {
    throw new Error("Manifest must contain at least one card.");
  }

  const seen = new Set<string>();
  for (const [index, card] of manifest.cards.entries()) {
    const number = requiredText(card.cardNumber, `cards[${index}].cardNumber`);
    requiredText(card.player, `cards[${index}].player`);
    if (seen.has(number)) {
      throw new Error(`Duplicate card number in manifest: ${number}`);
    }
    seen.add(number);
  }

  if (manifest.productSet.isBase && manifest.productSet.isInsert) {
    throw new Error("A Product Set cannot be both Base and Insert.");
  }

  const isBaseball = manifest.product.sport?.trim().toLowerCase() === "baseball";
  if (isBaseball) {
    const missingTeams = manifest.cards.filter(
      (card) => !isChecklistCard(card) && !card.team?.trim()
    );
    const teamDataComplete = manifest.review?.teamData === "COMPLETE";

    if (teamDataComplete && missingTeams.length > 0) {
      const sample = missingTeams
        .slice(0, 8)
        .map((card) => `#${card.cardNumber} ${card.player}`)
        .join(", ");
      throw new Error(
        `teamData is marked COMPLETE but ${missingTeams.length} non-checklist cards are missing teams. Example: ${sample}`
      );
    }

    if (apply && !teamDataComplete) {
      throw new Error(
        `Baseball set apply blocked: review.teamData must be COMPLETE. Current value: ${manifest.review?.teamData ?? "missing"}.`
      );
    }
  }

  return manifest;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const manifestArg = args.find((arg) => !arg.startsWith("--"));

  if (!manifestArg) {
    throw new Error(
      "Usage: npm run import:set -- <manifest.json> [--apply]"
    );
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  const enriched = await loadTeamSidecar(manifestPath, parsed);
  const manifest = validateManifest(enriched.manifest, apply);

  const existingProduct = await prisma.product.findUnique({
    where: { id: manifest.product.id },
    select: { id: true, released: true },
  });
  const existingProductSet = await prisma.productSet.findUnique({
    where: { id: manifest.productSet.id },
    select: { id: true },
  });
  const existingCards = await prisma.card.findMany({
    where: { productSetId: manifest.productSet.id },
    select: { cardNumber: true },
  });

  const existingNumbers = new Set(existingCards.map((card) => card.cardNumber));
  const insertedCards = manifest.cards.filter(
    (card) => !existingNumbers.has(card.cardNumber)
  ).length;
  const updatedCards = manifest.cards.length - insertedCards;

  const missingTeamCount = manifest.cards.filter(
    (card) => !isChecklistCard(card) && !card.team?.trim()
  ).length;

  console.log("[set-import] plan", {
    manifest: path.relative(process.cwd(), manifestPath),
    teamSidecar: enriched.teamSidecarPath
      ? path.relative(process.cwd(), enriched.teamSidecarPath)
      : null,
    mode: apply ? "APPLY" : "DRY_RUN",
    productId: manifest.product.id,
    productSetId: manifest.productSet.id,
    product: existingProduct ? "update-preserving-release-and-pricing" : "create-unreleased",
    productSet: existingProductSet ? "update-preserving-pricing" : "create",
    totalCards: manifest.cards.length,
    insertedCards,
    updatedCards,
    teamData: manifest.review?.teamData ?? "missing",
    missingTeamCount,
  });

  if (!apply) {
    console.log("[set-import] dry run complete; rerun with --apply to write.");
    return;
  }

  const legacySetId = `PS__${manifest.productSet.id}`;
  const pricing = manifest.productSet.pricing ?? {};

  await prisma.product.upsert({
    where: { id: manifest.product.id },
    create: {
      id: manifest.product.id,
      year: manifest.product.year ?? null,
      brand: manifest.product.brand ?? null,
      sport: manifest.product.sport ?? null,
      cardsPerPack: manifest.product.cardsPerPack ?? null,
      packsPerBox: manifest.product.packsPerBox ?? null,
      packPriceCents: manifest.product.packPriceCents ?? 0,
      autoPackPricing: manifest.product.autoPackPricing ?? true,
      packImageUrl: manifest.product.packImageUrl ?? null,
      boxImageUrl: manifest.product.boxImageUrl ?? null,
      released: false,
    },
    update: {
      year: manifest.product.year ?? null,
      brand: manifest.product.brand ?? null,
      sport: manifest.product.sport ?? null,
      cardsPerPack: manifest.product.cardsPerPack ?? null,
      packsPerBox: manifest.product.packsPerBox ?? null,
    },
  });

  await prisma.set.upsert({
    where: { id: legacySetId },
    create: {
      id: legacySetId,
      year: manifest.product.year ?? null,
      brand: manifest.product.brand ?? null,
      sport: manifest.product.sport ?? null,
      packPriceCents: 0,
    },
    update: {
      year: manifest.product.year ?? null,
      brand: manifest.product.brand ?? null,
      sport: manifest.product.sport ?? null,
    },
  });

  await prisma.productSet.upsert({
    where: { id: manifest.productSet.id },
    create: {
      id: manifest.productSet.id,
      productId: manifest.product.id,
      name: manifest.productSet.name ?? null,
      isBase: manifest.productSet.isBase,
      isInsert: manifest.productSet.isInsert,
      oddsPerPack: manifest.productSet.oddsPerPack ?? null,
      defaultGradeability:
        manifest.productSet.defaultGradeability ?? Gradeability.COMMON,
      commonPrice: pricing.commonPrice ?? null,
      semiStarPrice: pricing.semiStarPrice ?? null,
      unlistedStarPrice: pricing.unlistedStarPrice ?? null,
      star1Price: pricing.star1Price ?? null,
      star2Price: pricing.star2Price ?? null,
      star3Price: pricing.star3Price ?? null,
    },
    update: {
      productId: manifest.product.id,
      name: manifest.productSet.name ?? null,
      isBase: manifest.productSet.isBase,
      isInsert: manifest.productSet.isInsert,
      oddsPerPack: manifest.productSet.oddsPerPack ?? null,
      defaultGradeability:
        manifest.productSet.defaultGradeability ?? Gradeability.COMMON,
    },
  });

  for (const batch of chunks(manifest.cards, 75)) {
    const operations = batch.map((card) => {
      const createData: Prisma.CardUncheckedCreateInput = {
        setId: legacySetId,
        productSetId: manifest.productSet.id,
        cardNumber: card.cardNumber.trim(),
        player: card.player.trim(),
        team: card.team?.trim() || null,
        subset: card.subset?.trim() || null,
        variant: card.variant?.trim() || null,
        bookValue: card.bookValue ?? 0,
        quantityOwned: 0,
        frontImageUrl: card.frontImageUrl ?? null,
        backImageUrl: card.backImageUrl ?? null,
      };

      const updateData: Prisma.CardUncheckedUpdateInput = {
        player: card.player.trim(),
        ...(card.team ? { team: card.team.trim() } : {}),
        ...(card.subset ? { subset: card.subset.trim() } : {}),
        ...(card.variant ? { variant: card.variant.trim() } : {}),
      };

      return prisma.card.upsert({
        where: {
          productSetId_cardNumber: {
            productSetId: manifest.productSet.id,
            cardNumber: card.cardNumber.trim(),
          },
        },
        create: createData,
        update: updateData,
      });
    });

    await prisma.$transaction(operations);
  }

  console.log("[set-import] complete", {
    productId: manifest.product.id,
    productSetId: manifest.productSet.id,
    cards: manifest.cards.length,
    released: existingProduct?.released ?? false,
    teamData: manifest.review?.teamData ?? "missing",
    pricingPreservedOnRerun: true,
    imagesPreservedOnRerun: true,
  });
}

main()
  .catch((error) => {
    console.error("[set-import] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });