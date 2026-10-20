-- Prestige credits are a separate, non-cash ledger scoped to each product set.
-- Historical maximum completion counts were preserved by the existing system.
ALTER TABLE "ProductSetPrestige"
  ADD COLUMN "gradingCreditBalanceCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "gradingCreditedLevels" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "gradingCreditSpentCents" INTEGER NOT NULL DEFAULT 0;

-- Grant one $1 credit for each previously attained Prestige level.
-- One-time migration (tracked by Prisma migrations) and idempotent by level accounting.
UPDATE "ProductSetPrestige"
SET
  "gradingCreditBalanceCents" = GREATEST(0, "timesCompleted") * 100,
  "gradingCreditedLevels" = GREATEST(0, "timesCompleted");
