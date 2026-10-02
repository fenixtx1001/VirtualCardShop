import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateBatch, prepareBatch, verifyTargets } from "./lib/card-image-batch";

type SideResult = { cardId: number; side: "front" | "back"; before: string | null;
  key: string; status: string; url?: string; error?: string };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const offline = args.includes("--validate-only");
  if (apply && offline) throw new Error("--apply and --validate-only cannot be combined.");
  if (args.some(a => a.startsWith("--") && !["--apply", "--validate-only"].includes(a))) throw new Error("Unknown option.");
  const positional = args.filter(a => !a.startsWith("--"));
  if (positional.length !== 1) throw new Error("Usage: npm run import:card-images -- <manifest.json> [--validate-only | --apply]");
  const manifestPath = path.resolve(positional[0]);
  const batch = validateBatch(JSON.parse(await readFile(manifestPath, "utf8")));
  const images = await prepareBatch(batch, path.dirname(manifestPath));
  console.log(`[card-images] validated ${batch.cards.length} cards / ${images.length} files (checksums, sizes, format, provenance).`);
  if (offline) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Use your configured VCS terminal or --validate-only.");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const targets = await prisma.card.findMany({ where: { id: { in: batch.cards.map(c => c.cardId) } },
      select: { id: true, productSetId: true, cardNumber: true, player: true, frontImageUrl: true, backImageUrl: true } });
    const byId = verifyTargets(batch, targets);
    const jobs = images.filter(i => !byId.get(i.card.cardId)![`${i.side}ImageUrl`]?.trim());
    const rows = images.map(i => ({ id: i.card.cardId, player: i.card.player, side: i.side, source: i.asset.sourceType,
      action: jobs.includes(i) ? (apply ? "fill" : "would fill") : "preserve existing" }));
    console.table(rows);
    if (!apply) { console.log("Dry run only. Add --apply to upload and fill missing images."); return; }
    if (!jobs.length) { console.log("All supplied sides already have images; nothing to change."); return; }
    const { r2Configured, uploadToR2 } = await import("../src/lib/r2Upload");
    if (!r2Configured()) throw new Error("Apply requires existing VCS R2 environment variables.");
    // Persist old URLs before the first write. Existing images are never overwritten.
    const reportDir = path.resolve("data/card-image-runs");
    await mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${batch.batchId}-${Date.now()}.json`);
    const report = { schemaVersion: 1, batchId: batch.batchId, startedAt: new Date().toISOString(), finishedAt: null as string | null,
      targets, manifest: batch, results: [] as SideResult[] };
    const persist = () => writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    await persist();
    let errors = 0;
    for (const job of jobs) {
      const field = `${job.side}ImageUrl` as "frontImageUrl" | "backImageUrl";
      const before = byId.get(job.card.cardId)![field];
      const result: SideResult = { cardId: job.card.cardId, side: job.side, before, key: job.key, status: "pending" };
      report.results.push(result);
      try {
        // Save provenance with the image before exposing its URL in the Card record.
        const provenance = { ...job.asset, cardId: job.card.cardId, side: job.side, batchId: batch.batchId,
          verifiedScan: job.asset.sourceType === "verified_scan", importedAt: new Date().toISOString() };
        await uploadToR2({ key: job.key + ".metadata.json", contentType: "application/json",
          buffer: Buffer.from(JSON.stringify(provenance, null, 2)) });
        const url = await uploadToR2({ key: job.key, contentType: job.contentType, buffer: job.buffer });
        result.url = url; result.status = "uploaded";
        await persist();
        // Compare-and-set: protect an image filled by another import/admin since preflight.
        const changed = await prisma.card.updateMany({
          where: { id: job.card.cardId, productSetId: job.card.productSetId, cardNumber: job.card.cardNumber,
            player: job.card.player, [field]: before }, data: { [field]: url } });
        result.status = changed.count === 1 ? "updated" : "preserved-concurrent-change";
        if (changed.count === 1) {
          const actual = await prisma.card.findUnique({ where: { id: job.card.cardId }, select: { frontImageUrl: true, backImageUrl: true } });
          if (actual?.[field] !== url) throw new Error("Post-update URL verification failed.");
        }
        console.log(`[card-images] ${job.card.cardId} ${job.side}: ${result.status}`);
      } catch (error) {
        errors++; result.status = "failed";
        // Do not include credentials or full connection errors in a public artifact.
        result.error = "Operation failed; inspect local terminal output.";
        console.error(`[card-images] ${job.card.cardId} ${job.side}: failed`, error instanceof Error ? error.message : "unknown error");
      }
      await persist();
    }
    report.finishedAt = new Date().toISOString(); await persist();
    console.log(`Report: ${reportPath}. Reruns preserve filled sides and retry missing sides.`);
    if (errors) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; });
