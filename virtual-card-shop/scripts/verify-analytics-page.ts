/**
 * Read-only equivalence test for paged collector analytics. It never writes.
 * Usage: npx tsx scripts/verify-analytics-page.ts
 * Run against the SAME database used by the VCS deployment.
 */
import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: false, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { queryOwnedCardPage } = await import("../src/lib/analytics/owned-card-page");
  try {
    const collectors = await prisma.cardOwnership.groupBy({
      by: ["userId"],
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
    });
    if (!collectors.length) throw new Error("No collector inventory to verify.");
    for (const [index, user] of collectors.entries()) {
      const beginOld = Date.now();
      // Build the legacy calculation independently, but in bounded queries.
      // Prisma's nested ownership relation can generate an IN() statement with
      // >32,767 bind parameters when a collector owns tens of thousands of
      // cards. Do not use that giant relational include in a safety verifier.
      const ownedGroups = await prisma.cardOwnership.groupBy({
        by: ["cardId"],
        where: { userId: user.userId, quantity: { gt: 0 } },
        _sum: { quantity: true },
      });
      const qtyByCard = new Map(
        ownedGroups.map(row => [row.cardId, row._sum.quantity ?? 0])
      );
      const cardIds = [...qtyByCard.keys()];
      const cards: Array<{ id: number; player: string; bookValue: number }> = [];
      const CHUNK_SIZE = 1000;
      for (let offset = 0; offset < cardIds.length; offset += CHUNK_SIZE) {
        const batchIds = cardIds.slice(offset, offset + CHUNK_SIZE);
        const batch = await prisma.card.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, player: true, bookValue: true },
        });
        cards.push(...batch);
      }
      if (cards.length !== cardIds.length) {
        throw new Error(
          "Collector " + (index + 1) +
          " has ownerships with missing card records; cannot verify."
        );
      }
      // The old card.findMany() fetch typically arrived in Card primary-key
      // order. Our bounded verifier assembles cards from an unordered
      // groupBy() result, which scrambles same-player/same-value ties.
      // Normalize that incidental order before comparing to the optimized
      // SQL query (which explicitly breaks those ties by Card.id).
      cards.sort((a, b) => a.id - b.id);
      const legacy = cards.map(c => ({
        id: c.id,
        player: c.player,
        value: c.bookValue * (qtyByCard.get(c.id) ?? 0),
      })).sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.player.localeCompare(b.player) || a.id - b.id;
      });
      const legacyMs = Date.now() - beginOld;

      for (const page of [1, 2, 5, 8]) {
        const startNew = Date.now();
        const optimized = await queryOwnedCardPage({
          userId: user.userId, page, pageSize: 50,
          search: "", sport: "", year: "", brand: "",
          productId: "", productSetId: "", team: "", player: "",
        });
        const expectedPage = Math.min(page, Math.max(1, Math.ceil(legacy.length / 50)));
        const expected = legacy.slice((expectedPage - 1) * 50, expectedPage * 50).map(r => r.id);
        const actual = optimized.rows.map(r => r.cardId);
        if (optimized.total !== legacy.length ||
            optimized.page !== expectedPage ||
            JSON.stringify(expected) !== JSON.stringify(actual)) {
          const firstMismatch = expected.findIndex((id, i) => id !== actual[i]);
          throw new Error(
            "Collector " + (index + 1) + " page " + page +
            " mismatch at index " + firstMismatch +
            "; disable fast page until reviewed."
          );
        }
        console.log("Collector " + (index + 1) + ", page " + page +
          ": MATCH (SQL " + (Date.now() - startNew) +
          "ms; reference loaded in " + legacyMs + "ms)");
      }
    }
    console.log("PASS: default collector analytics pages match the legacy implementation.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(err => { console.error("STOP:", err.message); process.exitCode = 1; });
