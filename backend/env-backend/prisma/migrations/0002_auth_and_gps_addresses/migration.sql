-- Additive, non-destructive: no existing column or table is dropped or rewritten.

-- Customer authentication
ALTER TABLE "Customer" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- Address: state, landmark and confirmed GPS coordinates
ALTER TABLE "Address" ADD COLUMN "state" TEXT;
ALTER TABLE "Address" ADD COLUMN "landmark" TEXT;
ALTER TABLE "Address" ADD COLUMN "latitude" DECIMAL(9,6);
ALTER TABLE "Address" ADD COLUMN "longitude" DECIMAL(9,6);

ALTER TABLE "Address" ADD CONSTRAINT "Address_latitude_range" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "Address" ADD CONSTRAINT "Address_longitude_range" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
-- Coordinates come as a pair or not at all
ALTER TABLE "Address" ADD CONSTRAINT "Address_coords_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- Cake options on products (nullable JSONB; existing rows unaffected)
ALTER TABLE "Product" ADD COLUMN "cake" JSONB;
