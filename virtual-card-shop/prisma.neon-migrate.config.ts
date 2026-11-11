/**
 * Explicit Neon migration config for one-time schema deployment.
 * The existing prisma.config.ts is configured for an old local SQLite file
 * and must not be used to apply production PostgreSQL migrations.
 *
 * Usage: npx prisma migrate deploy --config prisma.neon-migrate.config.ts
 * Deployment scripts must verify the target host/branch before invoking this.
 */
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\//i.test(url)) {
  throw new Error(
    "Refusing Prisma migrations: DATABASE_URL must be a PostgreSQL URL."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
