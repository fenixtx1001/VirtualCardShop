import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { r2Configured, uploadToR2 } from "../src/lib/r2Upload";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageManifestCard = {
  cardNumber: string;
  frontSource?: string | null;
  backSource?: string | null;
};

type ImageManifest = {
  schemaVersion: 1;
  productSetId: string;
  storagePrefix?: string;
  cards: ImageManifestCard[];
};

type PreparedImage = {
  source: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
  hash: string;
};

type CardTarget = {
  id: number;
  cardNumber: string;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function validateManifest(input: unknown): ImageManifest {
  const manifest = input as ImageManifest;

  if (manifest?.schemaVersion !== 1) {
    throw new Error("Unsupported image manifest schemaVersion; expected 1.");
  }

  requiredText(manifest.productSetId, "productSetId");

  if (!Array.isArray(manifest.cards) || manifest.cards.length === 0) {
    throw new Error("Image manifest must contain at least one card.");
  }

  const seen = new Set<string>();
  for (const [index, card] of manifest.cards.entries()) {
    const cardNumber = requiredText(
      card.cardNumber,
      `cards[${index}].cardNumber`
    );

    if (seen.has(cardNumber)) {
      throw new Error(`Duplicate card number in image manifest: ${cardNumber}`);
    }
    seen.add(cardNumber);

    if (
      card.frontSource != null &&
      typeof card.frontSource !== "string"
    ) {
      throw new Error(`cards[${index}].frontSource must be a string or null.`);
    }
    if (
      card.backSource != null &&
      typeof card.backSource !== "string"
    ) {
      throw new Error(`cards[${index}].backSource must be a string or null.`);
    }
  }

  return manifest;
}

function sanitizeSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function detectImage(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: ".jpg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { contentType: "image/png", extension: ".png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: ".webp" };
  }

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) {
    return { contentType: "image/gif", extension: ".gif" };
  }

  throw new Error(
    "Unsupported or invalid image bytes. Expected JPEG, PNG, WebP, or GIF."
  );
}

async function readSource(source: string, manifestDir: string) {
  const trimmed = requiredText(source, "image source");

  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.1",
        "User-Agent": "VirtualCardShop-SetFactory/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `Image is too large (${contentLength} bytes; max ${MAX_IMAGE_BYTES}).`
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  const localPath = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(manifestDir, trimmed);

  return readFile(localPath);
}

async function prepareImage(source: string, manifestDir: string) {
  const buffer = await readSource(source, manifestDir);

  if (buffer.length === 0) {
    throw new Error("Image is empty.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image is too large (${buffer.length} bytes; max ${MAX_IMAGE_BYTES}).`
    );
  }

  const detected = detectImage(buffer);
  const hash = createHash("sha256").update(buffer).digest("hex");

  return {
    source,
    buffer,
    contentType: detected.contentType,
    extension: detected.extension,
    hash,
  } satisfies PreparedImage;
}

function makeStorageKey(params: {
  storagePrefix: string;
  productSetId: string;
  cardNumber: string;
  side: "front" | "back";
  image: PreparedImage;
}) {
  const { storagePrefix, productSetId, cardNumber, side, image } = params;
  const prefix = storagePrefix.replace(/^\/+|\/+$/g, "");
  const setSegment = sanitizeSegment(productSetId);
  const cardSegment = sanitizeSegment(cardNumber);
  const hashSegment = image.hash.slice(0, 16);

  return `${prefix}/${setSegment}/${cardSegment}/${side}-${hashSegment}${image.extension}`;
}

function getArgValue(args: string[], name: string) {
  const prefix = `${name}=`;
  const arg = args.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const overwrite = args.includes("--overwrite");
  const onlyCard = getArgValue(args, "--card")?.trim() || null;
  const manifestArg = args.find((arg) => !arg.startsWith("--"));

  if (!manifestArg) {
    throw new Error(
      "Usage: npm run import:set-images -- <images.json> [--apply] [--overwrite] [--card=<number>]"
    );
  }

  if (apply && !r2Configured()) {
    throw new Error(
      "R2 is not configured. Image apply mode requires the R2 environment variables."
    );
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifestDir = path.dirname(manifestPath);
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = validateManifest(parsed);
  const storagePrefix = manifest.storagePrefix?.trim() || "virtual-card-shop/cards";

  const selectedCards = onlyCard
    ? manifest.cards.filter((card) => card.cardNumber.trim() === onlyCard)
    : manifest.cards;

  if (onlyCard && selectedCards.length === 0) {
    throw new Error(`Card ${onlyCard} is not present in the image manifest.`);
  }

  const cardNumbers = selectedCards.map((card) => card.cardNumber.trim());
  const targets = await prisma.card.findMany({
    where: {
      productSetId: manifest.productSetId,
      cardNumber: { in: cardNumbers },
    },
    select: {
      id: true,
      cardNumber: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
  });

  const targetsByNumber = new Map<string, CardTarget>(
    targets.map((target) => [target.cardNumber, target])
  );

  const stats = {
    manifestCards: selectedCards.length,
    targetCardsFound: targets.length,
    targetCardsPendingCreation: 0,
    sourceSidesProvided: 0,
    sourceSidesMissing: 0,
    preservedExistingSides: 0,
    validatedSides: 0,
    uploadedSides: 0,
    updatedCards: 0,
    duplicateFrontBackPairs: 0,
    errors: 0,
  };

  console.log("[set-images] plan", {
    manifest: path.relative(process.cwd(), manifestPath),
    mode: apply ? "APPLY" : "DRY_RUN",
    productSetId: manifest.productSetId,
    storagePrefix,
    overwrite,
    onlyCard,
    manifestCards: selectedCards.length,
    targetCardsFound: targets.length,
  });

  for (const entry of selectedCards) {
    const cardNumber = entry.cardNumber.trim();
    const target = targetsByNumber.get(cardNumber) ?? null;

    if (!target) {
      stats.targetCardsPendingCreation += 1;
      if (apply) {
        stats.errors += 1;
        console.error(
          `[set-images] card ${cardNumber}: target Card does not exist; run the set manifest import first.`
        );
        continue;
      }
    }

    const frontSource = entry.frontSource?.trim() || null;
    const backSource = entry.backSource?.trim() || null;

    if (frontSource) stats.sourceSidesProvided += 1;
    else stats.sourceSidesMissing += 1;
    if (backSource) stats.sourceSidesProvided += 1;
    else stats.sourceSidesMissing += 1;

    const needsFront =
      !!frontSource && (overwrite || !target?.frontImageUrl?.trim());
    const needsBack = !!backSource && (overwrite || !target?.backImageUrl?.trim());

    if (frontSource && !needsFront) stats.preservedExistingSides += 1;
    if (backSource && !needsBack) stats.preservedExistingSides += 1;

    let front: PreparedImage | null = null;
    let back: PreparedImage | null = null;

    if (needsFront && frontSource) {
      try {
        front = await prepareImage(frontSource, manifestDir);
        stats.validatedSides += 1;
      } catch (error: any) {
        stats.errors += 1;
        console.error(
          `[set-images] card ${cardNumber} front failed: ${error?.message ?? error}`
        );
      }
    }

    if (needsBack && backSource) {
      try {
        back = await prepareImage(backSource, manifestDir);
        stats.validatedSides += 1;
      } catch (error: any) {
        stats.errors += 1;
        console.error(
          `[set-images] card ${cardNumber} back failed: ${error?.message ?? error}`
        );
      }
    }

    if (front && back && front.hash === back.hash) {
      stats.duplicateFrontBackPairs += 1;
      stats.errors += 1;
      console.error(
        `[set-images] card ${cardNumber}: front and back are identical; skipping both.`
      );
      front = null;
      back = null;
    }

    if (!apply || !target || (!front && !back)) {
      continue;
    }

    const updateData: {
      frontImageUrl?: string;
      backImageUrl?: string;
    } = {};

    if (front) {
      try {
        const key = makeStorageKey({
          storagePrefix,
          productSetId: manifest.productSetId,
          cardNumber,
          side: "front",
          image: front,
        });
        updateData.frontImageUrl = await uploadToR2({
          buffer: front.buffer,
          key,
          contentType: front.contentType,
        });
        stats.uploadedSides += 1;
      } catch (error: any) {
        stats.errors += 1;
        console.error(
          `[set-images] card ${cardNumber} front upload failed: ${error?.message ?? error}`
        );
      }
    }

    if (back) {
      try {
        const key = makeStorageKey({
          storagePrefix,
          productSetId: manifest.productSetId,
          cardNumber,
          side: "back",
          image: back,
        });
        updateData.backImageUrl = await uploadToR2({
          buffer: back.buffer,
          key,
          contentType: back.contentType,
        });
        stats.uploadedSides += 1;
      } catch (error: any) {
        stats.errors += 1;
        console.error(
          `[set-images] card ${cardNumber} back upload failed: ${error?.message ?? error}`
        );
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.card.update({
        where: { id: target.id },
        data: updateData,
      });
      stats.updatedCards += 1;
    }
  }

  console.log("[set-images] summary", stats);

  if (!apply && stats.targetCardsPendingCreation > 0) {
    console.log(
      "[set-images] note: missing target Cards are allowed during dry run because the draft set may not have been applied yet."
    );
  }

  if (stats.errors > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("[set-images] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
