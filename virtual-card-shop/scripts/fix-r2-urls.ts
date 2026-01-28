/* scripts/repair-r2-urls.ts */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "../src/lib/prisma";

function assertEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const VERBOSE = process.env.VERBOSE === "1";

const R2_ACCOUNT_ID = assertEnv("R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = assertEnv("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = assertEnv("R2_SECRET_ACCESS_KEY");
const R2_BUCKET_NAME = assertEnv("R2_BUCKET_NAME");
const R2_PUBLIC_BASE_URL = assertEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function isR2Url(url: string | null | undefined) {
  return typeof url === "string" && url.includes(".r2.dev/");
}

function extractKeyFromR2Url(url: string) {
  // R2 public base URL + "/" + key
  // Example: https://pub-xxxx.r2.dev/virtual-card-shop/cards/.../front-abc.jpg
  if (!url.startsWith(R2_PUBLIC_BASE_URL)) return null;
  const key = url.slice(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, "");
  return key || null;
}

async function urlExists(url: string) {
  try {
    // HEAD is ideal but some setups behave weird; GET is fine for small checks.
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function findOneKeyByPrefixes(prefixes: string[]) {
  for (const prefix of prefixes) {
    const out = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 10,
      })
    );

    const keys =
      (out.Contents ?? [])
        .map((x) => x.Key)
        .filter((k): k is string => typeof k === "string" && k.length > 0) ?? [];

    if (VERBOSE) {
      console.log(`[repair] list prefix="${prefix}" -> ${keys.length} keys`);
    }

    if (keys.length) {
      // Prefer “front-”/“back-” exact matches if multiple come back
      // Otherwise return the first key
      return keys[0];
    }
  }
  return null;
}

function candidatePrefixes(params: {
  productSetId: string;
  cardId: number;
  cardNumber: string;
  side: "front" | "back";
}) {
  const { productSetId, cardId, cardNumber, side } = params;

  // We try BOTH folder styles because your history shows both:
  // - /{cardId}/... (your earlier migration logs showed folder=575 etc)
  // - /{cardNumber}/... (your screenshot shows /1/...)
  //
  // We also try both "cards" and "uploads" because some URLs showed uploads/.
  const bases = [
    `virtual-card-shop/cards/${productSetId}/${cardId}/`,
    `virtual-card-shop/cards/${productSetId}/${cardNumber}/`,
    `virtual-card-shop/uploads/${productSetId}/${cardId}/`,
    `virtual-card-shop/uploads/${productSetId}/${cardNumber}/`,
  ];

  // Try to find any object that starts with side-
  return bases.map((b) => `${b}${side}-`);
}

async function repairSide(params: {
  cardId: number;
  productSetId: string;
  cardNumber: string;
  side: "front" | "back";
  currentUrl: string | null;
}) {
  const { cardId, productSetId, cardNumber, side, currentUrl } = params;

  if (!currentUrl) return { changed: false, newUrl: null as string | null, reason: "empty" };
  if (!isR2Url(currentUrl)) return { changed: false, newUrl: currentUrl, reason: "not-r2" };

  // If it loads, keep it
  const ok = await urlExists(currentUrl);
  if (ok) return { changed: false, newUrl: currentUrl, reason: "ok" };

  // Otherwise, find a real key by listing
  const prefixes = candidatePrefixes({ productSetId, cardId, cardNumber, side });
  const key = await findOneKeyByPrefixes(prefixes);

  if (!key) {
    return { changed: false, newUrl: currentUrl, reason: "missing-no-match" };
  }

  const newUrl = `${R2_PUBLIC_BASE_URL}/${key}`;
  return { changed: newUrl !== currentUrl, newUrl, reason: "repaired" };
}

async function main() {
  console.log("[repair] starting", { DRY_RUN, LIMIT, VERBOSE, R2_PUBLIC_BASE_URL });

  const cards = await prisma.card.findMany({
    select: {
      id: true,
      productSetId: true,
      cardNumber: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
    take: LIMIT,
  });

  console.log(`[repair] loaded ${cards.length} cards`);

  let checked = 0;
  let fixed = 0;
  let failed = 0;

  for (const c of cards) {
    checked++;

    const productSetId = (c.productSetId ?? "").trim();
    const cardNumber = (c.cardNumber ?? "").trim();

    if (!productSetId || !cardNumber) continue;

    try {
      const front = await repairSide({
        cardId: c.id,
        productSetId,
        cardNumber,
        side: "front",
        currentUrl: c.frontImageUrl,
      });

      const back = await repairSide({
        cardId: c.id,
        productSetId,
        cardNumber,
        side: "back",
        currentUrl: c.backImageUrl,
      });

      const updates: any = {};
      if (front.changed) updates.frontImageUrl = front.newUrl;
      if (back.changed) updates.backImageUrl = back.newUrl;

      const didFix = Object.keys(updates).length > 0;

      if (didFix) {
        fixed++;
        console.log(
          `[repair] ✓ card ${c.id} (#${cardNumber}) fixed`,
          updates
        );

        if (!DRY_RUN) {
          await prisma.card.update({
            where: { id: c.id },
            data: updates,
          });
        }
      } else if (VERBOSE) {
        console.log(
          `[repair] card ${c.id} (#${cardNumber}) no change`,
          { front: front.reason, back: back.reason }
        );
      }
    } catch (e: any) {
      failed++;
      console.error(`[repair] ✗ card ${c.id}:`, e?.message ?? e);
    }
  }

  console.log("[repair] done", { checked, fixed, failed, DRY_RUN });
}

main().catch((e) => {
  console.error("[repair] fatal", e);
  process.exit(1);
});
