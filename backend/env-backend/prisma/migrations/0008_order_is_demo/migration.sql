-- Orders were all stored as "demo" because the column defaulted to true. An order is a demo order only when its customer is the demo customer.
ALTER TABLE "Order" ALTER COLUMN "isDemo" SET DEFAULT false;
UPDATE "Order" o SET "isDemo" = c."isDemo" FROM "Customer" c WHERE c."id" = o."customerId";
