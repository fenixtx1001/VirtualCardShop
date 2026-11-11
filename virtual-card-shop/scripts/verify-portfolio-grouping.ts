/**
 * Read-only production-data parity check before enabling grouped valuation.
 * Usage: npx tsx scripts/verify-portfolio-grouping.ts
 * Loads the Codespace DATABASE_URL; never writes or prints private user data.
 */
import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: false, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getCollectionValueCents } = await import("../src/lib/portfolio");
  try {
    const users = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    let errors = 0;
    for (const user of users) {
      process.env.VCS_PORTFOLIO_GROUPED_VALUES = "0";
      const slowAt = Date.now();
      const reference = await getCollectionValueCents(prisma, user.id);
      const slowMs = Date.now() - slowAt;

      process.env.VCS_PORTFOLIO_GROUPED_VALUES = "1";
      const fastAt = Date.now();
      const optimized = await getCollectionValueCents(prisma, user.id);
      const fastMs = Date.now() - fastAt;
      const match = reference === optimized;
      if (!match) errors++;
      console.log(
        "Collector", users.indexOf(user) + 1,
        match ? "MATCH" : "MISMATCH",
        "legacy=" + slowMs + "ms",
        "grouped=" + fastMs + "ms"
      );
    }
    if (errors) throw new Error(errors + " valuation mismatches; do not deploy.");
    console.log("PASS: " + users.length + " collectors have identical portfolio valuations.");
  } finally {
    delete process.env.VCS_PORTFOLIO_GROUPED_VALUES;
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
