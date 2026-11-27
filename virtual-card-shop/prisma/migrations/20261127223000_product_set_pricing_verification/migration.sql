ALTER TABLE "ProductSet" ADD COLUMN "pricingVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE FUNCTION reset_product_set_pricing_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD."commonPrice",OLD."semiStarPrice",OLD."unlistedStarPrice",OLD."star1Price",OLD."star2Price",OLD."star3Price") IS DISTINCT FROM ROW(NEW."commonPrice",NEW."semiStarPrice",NEW."unlistedStarPrice",NEW."star1Price",NEW."star2Price",NEW."star3Price") THEN
    NEW."pricingVerified" := false;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_set_pricing_verification_reset BEFORE UPDATE ON "ProductSet" FOR EACH ROW EXECUTE FUNCTION reset_product_set_pricing_verification();
ALTER TABLE "ProductSet" ADD CONSTRAINT product_set_verified_complete CHECK (NOT "pricingVerified" OR ("commonPrice" IS NOT NULL AND "commonPrice" > 0 AND "semiStarPrice" IS NOT NULL AND "semiStarPrice" > 0 AND "unlistedStarPrice" IS NOT NULL AND "unlistedStarPrice" > 0 AND "star1Price" IS NOT NULL AND "star1Price" > 0 AND "star2Price" IS NOT NULL AND "star2Price" > 0 AND "star3Price" IS NOT NULL AND "star3Price" > 0));
