import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) throw new Error("A PostgreSQL DATABASE_URL is required in your environment or .env files.");
  const prisma = new PrismaClient();
  try {
    const sql = readFileSync("prisma/migrations/20260916000000_shop_discovery/migration.sql", "utf8");
    await prisma.$transaction(async (tx) => {
      for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        // Static checked-in SQL only. Does not run db push, reset or unrelated migrations.
        await tx.$executeRawUnsafe(statement);
      }
    });
    console.log("Shop promotion fields installed. Existing data retained.");
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Shop upgrade failed"); process.exitCode = 1; });
