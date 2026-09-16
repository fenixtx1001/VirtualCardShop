-- Additive, idempotent upgrade; existing daily deals and all user data are retained.
ALTER TABLE "DailyDeal" ADD COLUMN IF NOT EXISTS "saleProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DailyDeal" ADD COLUMN IF NOT EXISTS "shopPromotionsVersion" INTEGER NOT NULL DEFAULT 0;
