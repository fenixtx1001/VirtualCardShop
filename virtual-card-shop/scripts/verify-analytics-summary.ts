/**
 * Read-only equivalence check for aggregate analytics, using a real released
 * product to keep resource usage small. Never writes to the database.
 * Usage: npx tsx scripts/verify-analytics-summary.ts
 */
import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: false, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { aggregateSummaryRows, type AggregateGroup } = await import("../src/lib/analytics/aggregate-summary");
  try {
    const product = await prisma.product.findFirst({
      where: { released: true, productSets: { some: { cards: { some: {} } } } },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    const owner = await prisma.cardOwnership.findFirst({
      where: { quantity: { gt: 0 } },
      select: { userId: true },
    });
    if (!product || !owner) throw new Error("No product with cards or collector found.");

    for (const universe of ["all", "owned"] as const) {
      const cards = await prisma.card.findMany({
        where: {
          productSet: { productId: product.id },
          ...(universe === "owned" ? { ownerships: {
            some: { userId: owner.userId, quantity: { gt: 0 } },
          } } : {}),
        },
        include: {
          productSet: {
            select: {
              id: true, name: true, productId: true,
              product: { select: { id: true, year: true, brand: true, sport: true } },
            },
          },
          ownerships: {
            where: { userId: owner.userId, quantity: { gt: 0 } },
            select: { quantity: true },
          },
        },
      });
      const groups: AggregateGroup[] = ["team", "product", "product_set", "brand", "year", "sport"];
      for (const groupBy of groups) {
        const baseline = new Map<string, {
          cards: number; qty: number; value: number; book: number; max: number;
        }>();
        for (const c of cards) {
          const p = c.productSet?.product;
          const key = groupBy === "team" ? c.team || "—" :
            groupBy === "product" ? p?.id || c.productSet?.productId || "—" :
            groupBy === "product_set" ? c.productSetId || "—" :
            groupBy === "brand" ? p?.brand || "—" :
            groupBy === "year" ? String(p?.year ?? "—") :
            p?.sport || "—";
          const qty = c.ownerships.reduce((s, row) => s + row.quantity, 0);
          const value = c.bookValue;
          const existing = baseline.get(key) ?? { cards: 0, qty: 0, value: 0, book: 0, max: 0 };
          existing.cards++;
          existing.qty += qty;
          existing.value += qty * value;
          existing.book += value;
          existing.max = Math.max(existing.max, value);
          baseline.set(key, existing);
        }
        const optimized = await aggregateSummaryRows({
          scope: "me", universe, targetUserId: owner.userId,
          groupBy, search: "", player: "", team: "",
          year: "", brand: "", sport: "", productId: product.id,
          productSetId: "",
        });
        if (baseline.size !== optimized.length)
          throw new Error("Summary mismatch: " + universe + "/" + groupBy + " group count.");
        for (const row of optimized) {
          const a = baseline.get(row.key);
          const near = (x: number, y: number) => Math.abs(x - y) < 0.000001;
          if (!a || a.cards !== row.uniqueCards ||
            a.qty !== row.ownedQty ||
            !near(a.value, row.ownedValue) ||
            !near(a.book, row.totalBookValue) ||
            !near(a.max, row.maxBookValue))
            throw new Error("Summary mismatch: " + universe + "/" + groupBy + "/" + row.key);
        }
        console.log("MATCH:", universe, "/", groupBy, "(" + optimized.length + " groups)");
      }
    }
    console.log("PASS: all six grouped modes match raw Prisma results for the sample product.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error("STOP:", e.message); process.exitCode = 1; });
