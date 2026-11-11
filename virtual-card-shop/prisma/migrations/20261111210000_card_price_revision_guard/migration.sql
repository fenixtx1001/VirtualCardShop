-- Catalog price revision prevents a fast portfolio delta from carrying
-- forward old card prices. This migration is additive: old application
-- versions ignore the table and nullable column.
CREATE TABLE "CardPriceRevision" (
  "id" INTEGER NOT NULL,
  "revision" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "CardPriceRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CardPriceRevision" ("id", "revision") VALUES (1, 0);

ALTER TABLE "FinancialDailySnapshot"
  ADD COLUMN "cardPriceRevision" BIGINT;

-- Trigger is deliberately statement-level: a 1,000-card batch insert or
-- reprice increments the counter once, not 1,000 times. Single-row edits and
-- Set Factory imports also increment. The revision changes transactionally:
-- rolled-back edits do not invalidate snapshots, and lock contention prevents
-- a price mutation from committing through a FOR UPDATE revision read.
CREATE FUNCTION vcs_advance_card_price_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "CardPriceRevision"
     SET "revision" = "revision" + 1
   WHERE "id" = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing CardPriceRevision singleton; refusing catalog mutation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER vcs_card_price_insert
  AFTER INSERT ON "Card"
  FOR EACH STATEMENT
  EXECUTE FUNCTION vcs_advance_card_price_revision();

CREATE TRIGGER vcs_card_price_update
  AFTER UPDATE OF "bookValue" ON "Card"
  FOR EACH STATEMENT
  EXECUTE FUNCTION vcs_advance_card_price_revision();

CREATE TRIGGER vcs_card_price_delete
  AFTER DELETE ON "Card"
  FOR EACH STATEMENT
  EXECUTE FUNCTION vcs_advance_card_price_revision();

CREATE TRIGGER vcs_card_price_truncate
  AFTER TRUNCATE ON "Card"
  FOR EACH STATEMENT
  EXECUTE FUNCTION vcs_advance_card_price_revision();
