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
  if (!url) return false;
  return url.includes(".r2.dev") || url.startsWith(R2_PUBLIC_BASE_URL);
}

function keyFromUrl(url: string) {
  // Works for both R2_PUBLIC_BASE_URL and any r2.dev base
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/+/, "");
    return p;
  } catch {
    // fallback: strip configured base if it matches
    const stripped = url.replace(R2_PUBLIC_BASE_URL, "").replace(/^\/+/, "");
    return stripped;
  }
}

async function headViaHttp(url: string) {
  // R2 dev URLs respond fine to HEAD/GET; use GET with range just in case HEAD is blocked
  const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
  return res.status; // 206 or 200 = exists, 404 = missing, etc
}

async function listKeys(prefix: string) {
  const out: string[] = [];
  let token: string | undefined = undefined;

  // small pagination loop
  for (let i = 0; i < 10; i++) {
    const resp = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );

    for (const obj of resp.Contents ?? []) {
      if (obj.Key) out.push(obj.Key);
    }

    if (!resp.IsTruncated) break;
    token = resp.NextContinuationToken;
    if (!token) break;
  }

  return out;
}

function pickSide(keys: string[], side: "front" | "back") {
  // prefer exact "front-" / "back-" files
  const needle = `/${side}-`;
  const matches = keys.filter((k) => k.includes(needle));
  if (!matches.length) return null;

  // choose deterministically
  matches.sort((a, b) => a.localeCompare(b));
  return matches[0];
}

async function findReplacementKey(params: {
  productSetId: string;
  cardId: number;
  cardNumber: string;
  side: "front" | "back";
}) {
  const prefixes = [
    `virtual-card-shop/cards/${params.productSetId}/${params.cardId}/`,
    `virtual-card-shop/cards/${params.productSetId}/${params.cardNumber}/`,
  ];

  for (const prefix of prefixes) {
    const keys = await listKeys(prefix);
    if (VERBOSE) console.log(`[repair] list ${prefix} -> ${keys.length} keys`);
    const pick = pickSide(keys, params.side);
    if (pick) return pick;
  }

  return null;
}

async function main() {
  console.log("[repair] starting", {
    DRY_RUN,
    LIMIT,
    R2_PUBLIC_BASE_URL,
    VERBOSE,
  });

  const cards = await prisma.card.findMany({
    where: {
      OR: [{ frontImageUrl: { contains: "r2.dev" } }, { backImageUrl: { contains: "r2.dev" } }],
    },
    select: {
      id: true,
      productSetId: true,
      cardNumber: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
    take: LIMIT,
  });

  console.log(`[repair] found ${cards.length} cards with R2 URLs`);

  let checked = 0;
  let fixed = 0;
  let failed = 0;

  for (const c of cards) {
    checked++;

    const productSetId = (c.productSetId ?? "").trim();
    const cardNumber = (c.cardNumber ?? "").trim();

    if (!productSetId || !cardNumber) {
      if (VERBOSE) console.warn(`[repair] skip card ${c.id} (missing productSetId/cardNumber)`);
      continue;
    }

    const updates: any = {};
    const report: any = { front: "ok", back: "ok" };

    // FRONT
    if (isR2Url(c.frontImageUrl)) {
      try {
        const status = await headViaHttp(c.frontImageUrl!);
        if (status === 404) {
          report.front = "404";
          const replKey = await findReplacementKey({
            productSetId,
            cardId: c.id,
            cardNumber,
            side: "front",
          });
          if (replKey) {
            updates.frontImageUrl = `${R2_PUBLIC_BASE_URL}/${replKey}`;
            report.front = "fixed";
          } else {
            report.front = "missing";
          }
        }
      } catch (e) {
        report.front = "error";
      }
    }

    // BACK
    if (isR2Url(c.backImageUrl)) {
      try {
        const status = await headViaHttp(c.backImageUrl!);
        if (status === 404) {
          report.back = "404";
          const replKey = await findReplacementKey({
            productSetId,
            cardId: c.id,
            cardNumber,
            side: "back",
          });
          if (replKey) {
            updates.backImageUrl = `${R2_PUBLIC_BASE_URL}/${replKey}`;
            report.back = "fixed";
          } else {
            report.back = "missing";
          }
        }
      } catch (e) {
        report.back = "error";
      }
    }

    const changed = Object.keys(updates).length > 0;

    if (!changed) {
      console.log(`[repair] card ${c.id} (#${c.cardNumber}) no change`, report);
      continue;
    }

    try {
      if (!DRY_RUN) {
        await prisma.card.update({
          where: { id: c.id },
          data: updates,
        });
      }
      fixed++;
      console.log(`[repair] card ${c.id} (#${c.cardNumber}) UPDATED`, { ...report, updates });
    } catch (e: any) {
      failed++;
      console.error(`[repair] card ${c.id} (#${c.cardNumber}) update failed:`, e?.message ?? e);
    }
  }

  console.log("[repair] done", { checked, fixed, failed, DRY_RUN });
}

main().catch((e) => {
  console.error("[repair] fatal", e);
  process.exit(1);
});
