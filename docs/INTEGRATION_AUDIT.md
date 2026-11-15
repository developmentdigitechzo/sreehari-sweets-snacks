# Integration audit (Admin panel + Mobile app + Backend + PostgreSQL)

Status: plan **approved and implemented**. Results, verification and remaining gaps: [`INTEGRATION_REPORT.md`](INTEGRATION_REPORT.md).

## 1. Architecture today
```
Admin panel (Next.js) -> same-origin gateway (httpOnly cookie) -> Express API /api/admin/* -> PostgreSQL
Mobile app (Expo)     -> Express API (/catalog, /orders, /me/*, /auth/*, ...)               -> PostgreSQL
```
One backend, one database (5 Prisma migrations). Neither app talks to PostgreSQL directly. The admin panel has no data of its own. All pricing, stock, coupon, delivery and payment rules run in the backend.

## 2. What already works (verified by tests on real PostgreSQL)
- Admin -> database -> API: products, prices, stock, categories (with images), cakes, coupons (category eligibility enforced at checkout), delivery fee / free-delivery limit / COD limit / slot fees, serviceable PIN codes, banners, order status, returns, customer blocking. 88 API integration tests.
- `GET /catalog` reads published products, active categories, scheduled banners and coupons straight from the database, so admin changes are visible to the app on its next catalogue load.
- Orders: server recalculates prices, reserves stock in a transaction (never below zero), is idempotent, snapshots items/address, writes stock history and audit rows.
- Customers: signup/login (scrypt, rate limited), addresses, cart persistence.

## 3. Gaps found (mobile app in live mode)
| # | Gap | Effect |
|---|---|---|
| 1 | **Orders are stored only on the phone.** The app never calls `GET /orders` after placing one. Its tracking screen advances status with a local simulator. | Admin status changes **do not reach the app**. Orders placed from another device never appear. Workflow 2 fails in the app -> admin -> app direction. |
| 2 | **The catalogue store starts filled with bundled demo data** (`data/seed.ts`) and only replaces it after a successful `/catalog`. If the load fails, the demo data stays. | In live mode a slow or failed load can show demo products and prices that do not exist in the database. |
| 3 | **Delivery rules are duplicated.** Free-delivery limit, COD limit and slots are constants in the app (`data/config.ts`); the server now uses the admin-edited values. | The cart/checkout preview can disagree with the amount actually charged. |
| 4 | **Coupon list from `/catalog` omits eligibility** (categories, start date). | The app can offer a coupon the server will refuse (the server stays authoritative). |
| 5 | **Profile edits are local.** `PATCH /me` exists but the app never calls it. | Admin does not see name/email changes. |
| 6 | **A blocked customer with a still-valid token can place orders** (the block is checked only at sign-in and in admin routes). | Blocking is not fully enforced. |
| 7 | Customer-side screens missing for APIs that already exist: return/cancel request, notifications inbox, marketing opt-in, push token registration. | Returns workflow and in-app messages cannot be used by customers. |
| 8 | Wishlist is local only (no table, not in your list). | Not synchronised. |
| 9 | Duplicated business logic: mobile pricing preview (`services/pricing.ts`), mobile slot list. | Drift risk; the server value always wins. |
| 10 | Online payment checkout SDK not in the app. | COD only (known). |

No conflicting or duplicate **database** tables were found. No raw database access from either frontend.

## 3b. Items to verify during implementation (not yet confirmed)
Cart rows whose product was archived after being added; catalogue refresh on app foreground; order list after sign-out/sign-in on a different account; behaviour when the API is unreachable at launch.

## 4. API mapping
| Business area | Admin panel uses | Mobile app uses | Status |
|---|---|---|---|
| Products, sizes, images | `/admin/products*` | `GET /catalog` | OK (admin->app) |
| Categories, cakes | `/admin/categories`, `/admin/cakes` | `GET /catalog` | OK |
| Stock | `/admin/inventory*` | availability in `/catalog`; stock check in `POST /orders` | OK |
| Orders | `/admin/orders*` | `POST /orders` only | **Missing: list/detail/status read in app (gap 1)** |
| Customers | `/admin/customers*` | `/auth/*`, `/me/addresses`, `/me/cart` | profile write missing (gap 5) |
| Offers | `/admin/coupons`, `/admin/campaigns` | coupons in `/catalog`; checked in `POST /orders` | eligibility fields missing in catalogue (gap 4) |
| Delivery | `/admin/delivery` | `/serviceability/:pin`; rules hard-coded | **rules missing from catalogue (gap 3)** |
| Payments | `/admin/payments` (read) | `/payments/:orderId/*` | OK (COD / test provider) |
| Notifications | `/admin/broadcasts*` | none | inbox endpoints exist, no screens (gap 7) |
| Returns | `/admin/returns*` | `POST /orders/:id/return-requests` exists | no screens (gap 7) |
| Reports, audit, settings, staff | `/admin/*` | n/a | admin only |

## 5. Required database changes
**None expected.** All entities in your list already exist (`Customer`/staff roles, `Product*`, `Category`, `Cart`, `Address`, `Order*`/`OrderEvent`, `Payment*`, `Coupon`, `ServiceablePincode`/`Setting`, `Notification`, `AuditLog`, `StockMovement`). If implementation shows a need (for example an index to list a customer's orders by `updatedAt`), it will be one additive migration, explained before it is applied. No data is deleted or rewritten.

## 6. Implementation plan
1. **Order sync (gap 1).** App fetches `GET /orders` after sign-in, on the Orders tab, and on the tracking screen (refresh every ~15 s while open and on pull-to-refresh). Server status/payment/history replace local values. The status simulator and demo orders are hidden in live mode. Server stays the source of truth.
2. **Catalogue (gaps 2-4, 9).** Live mode never shows bundled demo products: skeleton while loading, an error with retry if it fails, an empty state if the catalogue is empty. `/catalog` also returns delivery rules/slots and coupon eligibility; the app's preview uses them. Refresh on app foreground and pull-to-refresh.
3. **Profile (gap 5).** App calls `PATCH /me` and reads `/auth/me`.
4. **Blocked customers (gap 6).** Server rejects order placement and cart/profile writes from blocked accounts.
5. **Customer screens (gap 7).** Return/cancel request on the order screen; notifications inbox with mark-as-read; marketing opt-in switch. Push-token registration needs a development build, so it is wired but cannot be verified here.
6. **End-to-end workflow tests** against real PostgreSQL (throwaway DB): the five workflows in your brief as one automated suite that plays both the mobile client contract and the admin client. Plus a browser run of the Expo web app in live mode with the admin panel side by side.
7. **Docs and deployment config**: API mapping, env variables for both apps, deployment checklist.
8. Final regression: backend/admin/mobile typecheck, lint, unit, integration, production builds.

## 7. Test plan
Admin login and role checks; customer signup/login/block; product create/edit/price/archive -> app; category and cake changes -> app; cart merge and quantity; checkout with COD (and test provider payment); duplicate checkout request (same key) creates one order; admin status change -> app shows it; stock deducted once, never negative, admin adjustment visible; customer profile/address -> admin; coupon create -> app -> server recalculation (including tampered client totals); delivery rules change -> next order total; API authorization (customer token on admin routes, other customer's orders); failure paths (unreachable API, out of stock, expired coupon). **Not testable here:** real phones, real payment/SMS/push providers.

## 8. Decisions needed
1. In live mode, hide the demo status simulator and demo seeded orders? (recommended: yes)
2. Keep the wishlist on the device only? (recommended: yes, not in scope)
3. Order updates by refresh every ~15 s while the order screen is open (works everywhere) rather than push notifications (needs a development build and credentials)?
4. Include the customer screens in section 6 item 5 in this round?
