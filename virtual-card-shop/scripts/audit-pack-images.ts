/**
 * Read-only R2/CDN image delivery audit.
 * In a Codespace: npx tsx scripts/audit-pack-images.ts
 * Optional: IMAGE_AUDIT_COUNT=12 npx tsx scripts/audit-pack-images.ts
 * Optional: IMAGE_AUDIT_URL=https://... npx tsx scripts/audit-pack-images.ts
 *
 * HEAD requests do not download image bodies; providers may still count reads.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MAX_SAMPLES = 20;
const count = Math.min(
  MAX_SAMPLES,
  Math.max(1, Number.parseInt(process.env.IMAGE_AUDIT_COUNT ?? "8", 10) || 8)
);

type ImageSample = { cardId: number | null; url: string };

function imageHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid URL";
  }
}

async function auditOne(sample: ImageSample) {
  const started = performance.now();
  try {
    const res = await fetch(sample.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });

    const durationMs = Math.round(performance.now() - started);
    const length = res.headers.get("content-length");
    const kilobytes = length && Number.isFinite(Number(length))
      ? Math.round(Number(length) / 1024)
      : null;

    return {
      cardId: sample.cardId,
      host: imageHost(sample.url),
      status: res.status,
      durationMs,
      sizeKB: kilobytes,
      cacheControl: res.headers.get("cache-control") ?? "not provided",
      cfCacheStatus: res.headers.get("cf-cache-status") ?? "not provided",
      contentType: res.headers.get("content-type") ?? "not provided",
    };
  } catch (error) {
    return {
      cardId: sample.cardId,
      host: imageHost(sample.url),
      status: "request failed",
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  let samples: ImageSample[] = [];
  const directUrl = process.env.IMAGE_AUDIT_URL?.trim();

  if (directUrl) {
    samples = [{ cardId: null, url: directUrl }];
  } else {
    const { prisma } = await import("../src/lib/prisma");
    try {
      const cards = await prisma.card.findMany({
        where: { frontImageUrl: { not: null } },
        orderBy: { id: "desc" },
        take: count,
        select: { id: true, frontImageUrl: true },
      });
      samples = cards.flatMap((card) => card.frontImageUrl
        ? [{ cardId: card.id, url: card.frontImageUrl }]
        : []);
    } finally {
      await prisma.$disconnect();
    }
  }

  if (!samples.length) {
    console.log("No image URLs found. No changes were made.");
    return;
  }

  console.log(`Checking ${samples.length} image(s) using HEAD (read-only)...`);
  const results = [];
  for (const sample of samples) {
    results.push(await auditOne(sample));
  }

  console.table(results);
  const devUrlCount = samples.filter((sample) => imageHost(sample.url).endsWith(".r2.dev")).length;
  if (devUrlCount) {
    console.log(`WARNING: ${devUrlCount}/${samples.length} sampled images use uncached r2.dev endpoints.`);
    console.log("Connect an R2 custom domain and configure NEXT_PUBLIC_R2_CDN_BASE_URL after DNS is live.");
  }
  console.log("Do not infer CDN cache effectiveness from a single request; inspect cf-cache-status after repeated real traffic.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
