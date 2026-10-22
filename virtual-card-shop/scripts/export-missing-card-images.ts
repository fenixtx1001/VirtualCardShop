import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith("--limit="))?.slice(8) ?? "100";
  const limit = Number(limitArg);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("--limit must be 1..10000.");
  const out = path.resolve(args.find(a => a.startsWith("--out="))?.slice(6) ?? "data/missing-card-images.json");
  if (args.some(a => !a.startsWith("--limit=") && !a.startsWith("--out=") && a !== "--owned-only")) throw new Error("Unknown option.");
  const cards = await prisma.card.findMany({ where: { OR: [
    { frontImageUrl: null }, { frontImageUrl: "" }, { backImageUrl: null }, { backImageUrl: "" } ] },
    select: { id: true, player: true, cardNumber: true, productSetId: true, setId: true, variant: true,
      bookValue: true, frontImageUrl: true, backImageUrl: true,
      productSet: { select: { name: true, product: { select: { year: true, brand: true, sport: true } } } },
      ownerships: { select: { quantity: true } } } });
  const ranked = cards.map(c => {
    const { ownerships, ...rest } = c;
    const ownedQuantity = ownerships.reduce((sum, o) => sum + o.quantity, 0);
    return { ...rest, ownedQuantity, priority: c.bookValue * Math.max(1, ownedQuantity),
      missingSides: [!c.frontImageUrl?.trim() ? "front" : null, !c.backImageUrl?.trim() ? "back" : null].filter(Boolean),
      publicUrl: `https://virtualcardshop.vercel.app/cards/${c.id}` };
  }).filter(c => !args.includes("--owned-only") || c.ownedQuantity > 0)
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(),
    totalMissing: ranked.length, cards: ranked.slice(0, limit) }, null, 2) + "\n");
  console.log(`Exported ${Math.min(limit, ranked.length)} of ${ranked.length} missing-image cards to ${out}`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Export failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
