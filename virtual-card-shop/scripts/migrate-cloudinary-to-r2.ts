/* scripts/migrate-cloudinary-to-r2.ts */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";

import { prisma } from "../src/lib/prisma";

function assertEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

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

function isCloudinaryUrl(url: string | null | undefined) {
  return typeof url === "string" && url.includes("cloudinary.com");
}

function extFrom(contentType: string | null, url: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/gif")) return ".gif";

  const urlExt = path.extname(new URL(url).pathname);
  if (urlExt && urlExt.length <= 5) return urlExt;
  return ".jpg";
}

function makeKey(params: {
  productSetId: string;
  cardId: string | number;
  side: "front" | "back";
  sourceUrl: string;
  ext: string;
}) {
  const hash = crypto.createHash("sha1").update(params.sourceUrl).digest("hex").slice(0, 10);
  return `virtual-card-shop/cards/${params.productSetId}/${String(params.cardId)}/${params.side}-${hash}${params.ext}`;
}

async function migrateOneUrl(params: {
  cardId: string | number;
  productSetId: string;
  side: "front" | "back";
  sourceUrl: string;
}) {
  const res = await fetch(params.sourceUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${params.side} for card ${params.cardId}`);
  }

  const contentType = res.headers.get("content-type");
  const ext = extFrom(contentType, params.sourceUrl);
  const key = makeKey({ ...params, ext });

  const buffer = Buffer.from(await res.arrayBuffer());

  if (!DRY_RUN) {
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType ?? "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  }

  return {
    key,
    newUrl: `${R2_PUBLIC_BASE_URL}/${key}`,
    bytes: buffer.length,
    contentType: contentType ?? "image/jpeg",
  };
}

async function main() {
  console.log("[migrate] starting", { DRY_RUN, LIMIT });

  const cards = await prisma.card.findMany({
    where: {
      OR: [{ frontImageUrl: { contains: "cloudinary.com" } }, { backImageUrl: { contains: "cloudinary.com" } }],
    },
    select: {
      id: true,
      productSetId: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
    take: LIMIT,
  });

  console.log(`[migrate] found ${cards.length} cards with Cloudinary URLs`);

  let migratedFront = 0;
  let migratedBack = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of cards) {
    const cardId = c.id as any;
    const productSetId = c.productSetId as any;

    if (productSetId == null || String(productSetId).trim() === "") {
      skipped++;
      console.warn(`[migrate] skip card ${String(cardId)} (missing productSetId)`);
      continue;
    }

    // FRONT
    if (isCloudinaryUrl(c.frontImageUrl)) {
      try {
        const out = await migrateOneUrl({
          cardId,
          productSetId: String(productSetId),
          side: "front",
          sourceUrl: c.frontImageUrl!,
        });

        if (!DRY_RUN) {
          await prisma.card.update({
            where: { id: c.id as any },
            data: { frontImageUrl: out.newUrl },
          });
        }

        migratedFront++;
        console.log(`[migrate] ✓ front ${String(cardId)} → ${out.newUrl}`);
      } catch (e: any) {
        failed++;
        console.error(`[migrate] ✗ front ${String(cardId)}:`, e?.message ?? e);
      }
    } else {
      skipped++;
    }

    // BACK
    if (isCloudinaryUrl(c.backImageUrl)) {
      try {
        const out = await migrateOneUrl({
          cardId,
          productSetId: String(productSetId),
          side: "back",
          sourceUrl: c.backImageUrl!,
        });

        if (!DRY_RUN) {
          await prisma.card.update({
            where: { id: c.id as any },
            data: { backImageUrl: out.newUrl },
          });
        }

        migratedBack++;
        console.log(`[migrate] ✓ back  ${String(cardId)} → ${out.newUrl}`);
      } catch (e: any) {
        failed++;
        console.error(`[migrate] ✗ back  ${String(cardId)}:`, e?.message ?? e);
      }
    } else {
      skipped++;
    }
  }

  console.log("[migrate] done", { migratedFront, migratedBack, skipped, failed, DRY_RUN });
}

main().catch((e) => {
  console.error("[migrate] fatal", e);
  process.exit(1);
});
