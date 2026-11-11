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
      const cards = await prisma.card.findMany({
        where: { ownerships: { some: {
          userId: user.userId, quantity: { gt: 0 },
        } } },
        select: {
          id: true, player: true, bookValue: true,
          ownerships: {
            where: { userId: user.userId, quantity: { gt: 0 } },
            select: { quantity: true },
          },
        },
      });
      const legacy = cards.map(c => ({
        id: c.id,
        player: c.player,
        value: c.bookValue * c.ownerships.reduce((s, row) => s + row.quantity, 0),
      })).sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.player.localeCompare(b.player);
      });
      const legacyMs = Date.now() - beginOld;

      for (const page of [1, 2, 5]) {
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
