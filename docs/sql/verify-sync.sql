-- ============================================================================================
-- Shree Hari: PostgreSQL checks for pgAdmin 4
-- Table and column names below are the real ones from backend/prisma/schema.prisma. Prisma creates
-- them with capital letters, so they MUST be written in double quotes ("Product", not product).
-- Everything here is read-only (SELECT). Run each block on its own: select it, press F5.
-- ============================================================================================

-- 0. Am I looking at the right database? -------------------------------------------------
--    The name must match the end of DATABASE_URL in backend\.env (default: shree_hari).
--    In pgAdmin the database you right-clicked "Query Tool" on is shown in the tab title.
SELECT current_database() AS database, current_user AS db_user, inet_server_port() AS port,
       current_setting('TimeZone') AS time_zone,   -- should be UTC
       now() AS server_time;

--    The same facts, as the API sees them (admin panel: Settings > System check).
--    All migrations applied? (expect 5 rows, finished_at filled)
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;

-- 1. Newest products ---------------------------------------------------------------------
SELECT p.id, p.name, p."categoryId", p."isActive", p."archivedAt", p."createdAt", p."updatedAt"
FROM "Product" p
ORDER BY p."createdAt" DESC
LIMIT 20;

-- 2. Latest edited products (name, category, publish status change "updatedAt") --------------
SELECT p.id, p.name, p."categoryId", p."isActive", p."archivedAt", p."updatedAt"
FROM "Product" p
ORDER BY p."updatedAt" DESC
LIMIT 20;

-- 3. Prices, MRP, stock and SKU per size ---------------------------------------------------
SELECT p.name, v.id AS variant_id, v.sku, v.label AS size, v.mrp, v.price, v.stock
FROM "ProductVariant" v
JOIN "Product" p ON p.id = v."productId"
ORDER BY p."updatedAt" DESC, v.mrp
LIMIT 50;

-- 4. Category of each product, with its parent ----------------------------------------------
SELECT p.name AS product, c.id AS category, c.name AS category_name, parent.name AS parent_category, c."isActive" AS category_visible
FROM "Product" p
JOIN "Category" c ON c.id = p."categoryId"
LEFT JOIN "Category" parent ON parent.id = c."parentId"
ORDER BY p."updatedAt" DESC
LIMIT 30;

-- 5. Product images (the address the app is given) -------------------------------------------
--    "url" = an uploaded image; "key" = a bundled demo image. An address starting with
--    http://localhost cannot load on a phone (the API rewrites it for phones; this shows what is stored).
SELECT p.name, i."sortOrder", i.url, i.key
FROM "ProductImage" i
JOIN "Product" p ON p.id = i."productId"
ORDER BY p."updatedAt" DESC, i."sortOrder"
LIMIT 30;

-- 6. WHAT THE APP WILL SEE: exactly the rule the customer API (GET /api/catalog) applies --------
--    A product is shown if it is published, not archived. Stock 0 is still shown (as sold out).
SELECT p.id, p.name, p."categoryId", min(v.price) AS price_from, sum(v.stock) AS total_stock,
       CASE WHEN p."isActive" AND p."archivedAt" IS NULL THEN 'SHOWN IN APP' ELSE 'hidden' END AS app_visibility
FROM "Product" p
JOIN "ProductVariant" v ON v."productId" = p.id
GROUP BY p.id
ORDER BY p."updatedAt" DESC
LIMIT 30;

--    Which collection tab (Sweets / Cakes / Snacks ...) lists each product?
--    A collection covers its listed subcategories; the API also adds the root category itself and its whole branch.
SELECT p.name AS product, p."categoryId", col.id AS collection
FROM "Product" p
JOIN "Collection" col ON p."categoryId" = ANY (col."categoryIds") OR p."categoryId" = col.id
WHERE p."isActive" AND p."archivedAt" IS NULL
ORDER BY p."updatedAt" DESC, col."sortOrder"
LIMIT 40;

-- 7. Stock history: did my stock change really happen? (append-only, nothing can be edited) -----
SELECT m."createdAt", m.sku, m.delta, m."stockAfter", m.reason, m.actor, m.note
FROM "StockMovement" m
ORDER BY m."createdAt" DESC
LIMIT 30;
--    Does history add up to the stock? (every row should show difference 0 for products created through the admin panel)
SELECT v.sku, v.stock AS stock_now, COALESCE(sum(m.delta), 0) AS history_total
FROM "ProductVariant" v LEFT JOIN "StockMovement" m ON m."variantId" = v.id
GROUP BY v.id
ORDER BY v.sku
LIMIT 30;

-- 8. Who changed what, and when (admin panel actions) -------------------------------------------
SELECT a."createdAt", a."actorName", a.action, a.entity, a."entityId", a.summary
FROM "AuditLog" a
ORDER BY a."createdAt" DESC
LIMIT 30;
--    Did my UPDATE really change a record? Look for action = 'product.update' / 'product.toggle' /
--    'inventory.adjust' for that entity id, then compare "updatedAt" in query 2.

-- 9. Orders placed in the mobile app -----------------------------------------------------------------
SELECT o.number, o.status, o.total, o."createdAt", c.name AS customer, c.phone, pay.method, pay.status AS payment_status
FROM "Order" o
JOIN "Customer" c ON c.id = o."customerId"
LEFT JOIN "Payment" pay ON pay."orderId" = o.id
ORDER BY o."createdAt" DESC
LIMIT 20;
--    Items and status history of the newest order
SELECT oi.name, oi."variantLabel", oi.qty, oi."unitPrice"
FROM "OrderItem" oi WHERE oi."orderId" = (SELECT id FROM "Order" ORDER BY "createdAt" DESC LIMIT 1);
SELECT e.status, e.actor, e.at FROM "OrderEvent" e
WHERE e."orderId" = (SELECT id FROM "Order" ORDER BY "createdAt" DESC LIMIT 1) ORDER BY e.at;

-- 10. Customers and addresses --------------------------------------------------------------------------
SELECT c.id, c.name, c.phone, c.email, c.role, c."isBlocked", c."marketingOptIn", c."createdAt"
FROM "Customer" c
WHERE c.role = 'CUSTOMER'
ORDER BY c."createdAt" DESC
LIMIT 20;
SELECT a."customerId", a.label, a.line1, a.area, a.city, a.pincode, a."isDefault", a."createdAt"
FROM "Address" a ORDER BY a."createdAt" DESC LIMIT 20;

-- 11. Offers and coupons -----------------------------------------------------------------------------------
SELECT code, title, type, value, "minOrder", "startsAt", "expiresAt", "usageLimit", "usedCount", "categoryIds", "isActive"
FROM "Coupon" ORDER BY code;

-- 12. Delivery and store settings saved from the admin panel -------------------------------------------------
SELECT key, value, "updatedBy", "updatedAt" FROM "Setting" ORDER BY "updatedAt" DESC;
SELECT pincode, "isActive" FROM "ServiceablePincode" ORDER BY pincode;

-- 13. Problems to look for (each should return no rows) -----------------------------------------------------------
--    products with no size/price
SELECT p.id, p.name FROM "Product" p LEFT JOIN "ProductVariant" v ON v."productId" = p.id WHERE v.id IS NULL;
--    products in a category that has subcategories (they can hide from the app's tabs; the admin panel now refuses new ones)
SELECT p.id, p.name, p."categoryId" FROM "Product" p WHERE EXISTS (SELECT 1 FROM "Category" k WHERE k."parentId" = p."categoryId");
--    negative stock (blocked by a database rule; should never appear)
SELECT sku, stock FROM "ProductVariant" WHERE stock < 0;
--    orders with no payment or no items
SELECT o.number FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id) OR NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o.id);
