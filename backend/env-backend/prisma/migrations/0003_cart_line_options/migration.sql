-- Customised cake lines: a cart line is identified by size + flavour + message, not by size alone.
-- Existing rows are preserved: they get the key of a line with no options ("variantId||").

ALTER TABLE "CartItem" ADD COLUMN "lineKey" TEXT;
ALTER TABLE "CartItem" ADD COLUMN "options" JSONB;
UPDATE "CartItem" SET "lineKey" = "variantId" || '||' WHERE "lineKey" IS NULL;
ALTER TABLE "CartItem" ALTER COLUMN "lineKey" SET NOT NULL;

DROP INDEX "CartItem_customerId_variantId_key";
CREATE UNIQUE INDEX "CartItem_customerId_lineKey_key" ON "CartItem"("customerId", "lineKey");

-- Order history keeps the customisation that was ordered
ALTER TABLE "OrderItem" ADD COLUMN "options" JSONB;
