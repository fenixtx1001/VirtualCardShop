-- Opt-in rarity configuration. Null retains legacy uniform Base draws.
-- Apply before generating the Prisma client or running the rarity-aware branch.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "packRarityConfig" JSONB;
