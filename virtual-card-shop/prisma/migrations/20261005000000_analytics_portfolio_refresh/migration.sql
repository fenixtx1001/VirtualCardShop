ALTER TABLE "SealedInventory"
ADD COLUMN IF NOT EXISTS "costBasisCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "sealedValueCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "openingNetWorthCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "closingNetWorthCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialDailySnapshot"
ADD COLUMN IF NOT EXISTS "valuationVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinancialDailySnapshot"
ALTER COLUMN "valuationVersion" SET DEFAULT 2;

WITH purchase_basis AS (
  SELECT
    ft."userId",
    ft.metadata->>'productId' AS "productId",
    SUM(
      CASE
        WHEN COALESCE(ft.metadata->>'costCents', '') ~ '^[0-9]+$'
          THEN (ft.metadata->>'costCents')::INTEGER
        ELSE 0
      END
    )::BIGINT AS "totalCostCents",
    SUM(
      CASE
        WHEN COALESCE(ft.metadata->>'packsAdded', '') ~ '^[0-9]+$'
          THEN (ft.metadata->>'packsAdded')::INTEGER
        ELSE 0
      END
    )::BIGINT AS "totalPacks"
  FROM "FinancialTransaction" ft
  WHERE ft.category IN ('PACK_PURCHASE', 'BOX_PURCHASE')
    AND ft.metadata IS NOT NULL
  GROUP BY ft."userId", ft.metadata->>'productId'
)
UPDATE "SealedInventory" si
SET "costBasisCents" = GREATEST(
  0,
  ROUND(
    si."packsOwned" * pb."totalCostCents"::NUMERIC / NULLIF(pb."totalPacks", 0)
  )::INTEGER
)
FROM purchase_basis pb
WHERE si."userId" = pb."userId"
  AND si."productId" = pb."productId"
  AND si."packsOwned" > 0
  AND pb."totalPacks" > 0
  AND si."costBasisCents" = 0;

UPDATE "SealedInventory" si
SET "costBasisCents" = GREATEST(0, si."packsOwned" * COALESCE(p."packPriceCents", 0))
FROM "Product" p
WHERE p.id = si."productId"
  AND si."packsOwned" > 0
  AND si."costBasisCents" = 0;

UPDATE "FinancialDailySnapshot"
SET
  "openingNetWorthCents" = "netWorthCents",
  "closingNetWorthCents" = "netWorthCents"
WHERE "valuationVersion" = 1
  AND "openingNetWorthCents" = 0
  AND "closingNetWorthCents" = 0;
