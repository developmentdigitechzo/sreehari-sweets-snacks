# Database migration report

Verified on a real **PostgreSQL 18** server (embedded test instance, throwaway databases, never production).
Raw output: [`evidence/db-migration-test.txt`](evidence/db-migration-test.txt) · API-level proof: [`evidence/backend-integration-postgres.txt`](evidence/backend-integration-postgres.txt)

## Migrations
| # | Name | What it does | Destructive? |
|---|---|---|---|
| 0001 | `0001_init` | All tables, enums, FKs, indexes; CHECK constraints (non-negative price/stock, positive qty, money ≥ 0); append-only trigger on `RewardLedger`; `order_number_seq` | n/a (initial) |
| 0002 | `0002_auth_and_gps_addresses` | `Customer.passwordHash`, unique `Customer.email`; `Address.state/landmark/latitude/longitude` with range + "coordinates come as a pair" CHECKs; `Product.cake` JSONB | **No** — additive |
| 0003 | `0003_cart_line_options` | `CartItem.lineKey/options`, unique index `(customerId, lineKey)` replaces `(customerId, variantId)`; `OrderItem.options` | **No data loss** — existing cart rows are back-filled (`variantId||`); only a unique index is relaxed |

## Results
**A. Fresh database** — `prisma migrate deploy`: 3 migrations applied, all `OK`.

**B. Existing database upgrade** — a database at 0001+0002 holding a customer, an address and a cart row was upgraded with 0003:
- rows before: customers 1 / cartItems 1 / addresses 1 → after: **unchanged**
- cart row back-filled to `lineKey = "v1||"`, qty preserved
- old address's new columns are `NULL` (nothing invented)

**C. Constraints and integrity (all rejected bad data):**
negative stock → `ProductVariant_stock_nonneg` · price > MRP → `ProductVariant_price_nonneg` · latitude 95 → `Address_latitude_range` · latitude without longitude → `Address_coords_pair` · duplicate email → `Customer_email_key` · ledger UPDATE/DELETE → trigger "RewardLedger is append-only".
15 foreign keys; unique indexes on order number, idempotency key, email, cart line key; `order_number_seq` starts at 12457.

**D. Seed** — runs twice without error (repeatable): 25 products, 4 coupons, demo customer.

**E. API on PostgreSQL** — 30/30: signup/login, scrypt hashes, IDOR on addresses/cart/orders, customised cart lines persisted separately, stock caps across lines, price tampering ignored, idempotent orders (stock taken once), failed payment creates nothing, **last-unit race (exactly one of two buyers wins)**, **coupon usage cap under concurrency**, append-only ledger.

## Recovery / rollback strategy
- Migrations are forward-only (Prisma). Before any production deploy: take a backup (`pg_dump`), apply to staging first, then `migrate deploy`.
- 0002 and 0003 are additive; a code rollback can run on the new schema without data loss. To undo schema, write a new forward migration (do not edit applied ones).
- Never run `migrate dev`/`migrate reset` against production.

## Requirements for any new database
- Encoding **UTF8** (the catalogue stores "₹"). A `WIN1252` database fails the seed — this was hit during testing.
- PostgreSQL 14+.

## Not verified
Production-scale data volumes, backup/restore drills, connection pooling, and migrations against a managed PostgreSQL service.


## 0005_admin_panel (additive)
See [`ADMIN_PANEL.md`](ADMIN_PANEL.md) for the table/column list. Role value `ADMIN` is renamed to `SUPER_ADMIN` (`ALTER TYPE … RENAME VALUE`, no rows rewritten) and `MANAGER` added; `StockMovement` and `AuditLog` get append-only triggers and a non-negative stock check. Verified on a fresh database and as an upgrade over data from 0004 (an ADMIN row became SUPER_ADMIN, an existing coupon and banner got safe defaults, UPDATE/DELETE on the history tables is refused): `evidence/db-upgrade-0005.txt`, `evidence/db-migration-test.txt`. Schema and migrations have no drift (`prisma migrate diff` is empty). Not run against any production database.
