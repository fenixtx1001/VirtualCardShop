import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { syncDailyPortfolioSnapshot } from "../src/lib/portfolio";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error(
      "A PostgreSQL DATABASE_URL is required in .env.local, .env, or the environment."
    );
  }

  const prisma = new PrismaClient();

  try {
    const sql = readFileSync(
      "prisma/migrations/20261005000000_analytics_portfolio_refresh/migration.sql",
      "utf8"
    );

    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const users = await prisma.user.findMany({ select: { id: true } });

    for (const user of users) {
      await syncDailyPortfolioSnapshot(prisma, user.id);
    }

    console.log(
      `Analytics portfolio upgrade installed. Daily baseline ready for ${users.length} user(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Analytics upgrade failed.");
  process.exitCode = 1;
});
