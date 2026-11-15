# Synchronisation report: Admin ↔ Backend ↔ PostgreSQL ↔ Mobile app

Follows [`SYNC_AUDIT.md`](SYNC_AUDIT.md). Everything below was run; what was not verified is listed at the end.

## 1. Root cause (exact)
Admin → API → PostgreSQL → catalogue API **always worked**: your product `rasagula` was saved correctly and was in `GET /api/catalog`. The failures were between the API and the app, and there were five of them:

| # | Cause | Where |
|---|---|---|
| 1 | **The app ran in demo mode.** `mobile/.env` did not exist and Expo was started with plain `expo start`; the running bundle had no `EXPO_PUBLIC_USE_MOCK`, so it resolved to demo mode and used built-in data. It never called the API. | mobile launch config |
| 2 | **Parent-category products hid from tabs.** Admin allowed saving in a top-level category (`sweets`); the app's Sweets tab listed only subcategories. | `/catalog` collections, admin category picker |
| 3 | **New products never reached Home.** Home shelves need opt-in flags. | `/catalog`, Home shelf order |
| 4 | **Image links said `localhost`.** Uploads stored `http://localhost:4000/uploads/…`, unreachable from a phone. | upload and catalogue responses |
| 5 | **The app loaded the catalogue once, at start-up.** | `useCatalog` |

Checked and ruled out: different databases/APIs, wrong endpoint, backend publish/stock/category filtering, response format, HTTP caching of the catalogue, admin save failing.

## 2. What was changed

### Backend (`backend/src`)
| File | Change |
|---|---|
| `modules/sync/changes.ts` (new) | Catalogue **change feed**: a version number bumped only after a successful (2xx, committed) admin/order/payment write; `waitForChange` for long polling |
| `modules/sync/sync.routes.ts` (new) | `GET /catalog/version`, **`GET /catalog/wait?version=…&timeout=…`** (long poll, max 25 s) |
| `modules/sync/publicUrl.ts` (new) | Upload links follow the address the caller used (phone via `192.168.x.x` gets image links on that address); legacy `localhost` links fixed at read time, no data edited; `isOwnUpload` for validation; images from other sites untouched |
| `modules/catalog/catalog.routes.ts` | Collections include their whole category branch; products added in the last 14 days are marked `newArrival` (computed, not stored); `meta.version` and `store` contact added; **no timestamps in the body** so ETag/304 works |
| `app.ts` | `trackChanges`, upload-link rewrite for catalogue/orders/me, `Cache-Control`: `no-cache` (revalidate, ETag → 304) for shared data, `no-store` for personal/admin data |
| `modules/admin/catalog.routes.ts` | A product cannot be created in (or moved into) a category that has subcategories (422 with the subcategory names) |
| `modules/admin/settings.routes.ts` | `GET /admin/diagnostics` (database name/host/port, migrations applied, time zone, catalogue version, counts; **no credentials**) |
| `modules/admin/{catalog,offers,broadcast}.routes.ts`, `modules/uploads` | Image-link validation no longer depends on one fixed hostname |

### Mobile app (`mobile/`)
| File | Change |
|---|---|
| `.env` (new), `package.json` | `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_URL=http://192.168.1.3:4000/api`; `npm run start:live` (clears Expo's cached values) |
| `src/services/catalogSync.ts` (new), `App.tsx` | **Long-poll listener** while the app is open; reload on foreground (if older than 15 s); retry with back-off |
| `src/store/useCatalog.ts` | `ensureFresh`, `version`, `loadedAt`; a failed background refresh keeps the products on screen; every screen that becomes active re-checks (Home, Categories, Search, product page, cart, checkout) |
| `src/screens/HomeScreen.tsx` | "Demo data" ribbon whenever the app is in demo mode; newest product first in New Arrivals |
| `AccountScreen`, `OffersScreen`, `Summary`, `OrderTrackingScreen` | Live mode: no referral, photo editor or "(demo)" labels; real store contact for "Help with this order"; **About shows server address and catalogue version** |

### Admin panel (`admin/`)
Category picker offers only specific categories (grouped), with a hint; hint about Home shelves; **Settings → System check** (same facts as `/admin/diagnostics`); gateway never caches.

### Database
**No migration, no schema change, no data written or deleted.** (All checks against your real database were read-only.)

## 3. Real-time updates: decision
SSE/WebSocket were evaluated. React Native has no `EventSource`, and a WebSocket server adds a dependency and a second code path, so the app uses **HTTP long polling** (`/catalog/wait`) plus refresh-on-foreground plus pull-to-refresh. Events are sent only after a successful write; the version is only a hint, and the app always reloads the real catalogue. **Limit:** the counter is in memory, so with several API instances an app may wait for its next foreground/pull refresh; replace with PostgreSQL `LISTEN/NOTIFY` or Redis before scaling out.

## 4. Verification
### 4a. The exact scenario, with DB and API evidence (`npm run test:sync`, 13/13)
| Step | Action | Admin API | PostgreSQL | App API |
|---|---|---|---|---|
| 1-3 | Create `SYNC TEST SWEET 001` (milk-sweets, ₹100, stock 12, image) | 201, record returned | row in `"Product"`, `"ProductVariant"`, `"ProductImage"` | in `/catalog`, new-flag, in Sweets collection, image address loads |
| 4-5 | Price → ₹120 | 200, stored value returned | `price = 120` | ₹120; old ETag no longer valid (200), unchanged data returns **304** |
| 6 | New image | 200 | old image row replaced | new address returned |
| 7 | Unpublish | 200 | `isActive = false` | missing; order refused (422) |
| 8 | Publish | 200 | `isActive = true` | back; order accepted |
| 9 | Stock 3, then 0 | 200 | stock 3, then 0 | app shows 3, then sold out; oversell refused (409); stock history sums to stock |
| 10 | Archive | 200 | `archivedAt` set, **row and order lines kept** | missing |
Also tested: change feed wakes a waiting client in well under a second and times out quietly when nothing changed; **a rejected admin request does not announce a change**; cache headers; parent-category legacy product (the Rasagula case) is listed under the Sweets collection; admin refuses new parent-category products; admin diagnostics agree with the app's catalogue count and version, with no credentials in the output.

### 4b. Same scenario in a real browser (app open in one tab, admin panel in another, test database)
- Product created **through the admin form** → app (not reloaded) showed it first in New Arrivals, with name, size, ₹100 / MRP ₹150.
- Price, unpublish, publish and stock changes made while the app stayed open: ₹100 → **₹120** within 4 s; unpublished → **disappeared**; published → **back**; stock 0 → **"Out of stock"** overlay and disabled Add; restored.
- Sweets tab: "23 products"; searching "sync test" inside it found the product.
- Not driven through the browser UI (API tests cover them): image upload through the file picker, add to cart and checkout of the test product.

### 4c. Your real database, new code (read-only check)
Running the new API against your `shree_hari` database: **Rasagula is now in the Sweets collection scope**, flagged New (computed), image link rewritten to the caller's address. Nothing was written.

### 4d. Checks
| Check | Result |
|---|---|
| Backend typecheck, lint, build | clean / clean / ok |
| Backend unit tests | 53 / 53 |
| Integration on PostgreSQL: API, OTP-reset-payments, admin, workflows, **sync** | 30 / 25 / 33 / 15 / **13**, all pass |
| Mobile typecheck, lint, unit tests, Android production bundle | clean, clean, 27 / 27, built |
| Admin typecheck, lint, production build | clean, clean, built |
| 24 pgAdmin queries against your real schema | 24 / 24 run without error |

Raw output: `docs/evidence/`.

## 5. Other modules (both directions)
Categories, cakes, inventory, offers/coupons, customers/addresses, orders/status, payments (COD and test provider), delivery rules and reports were verified in the earlier integration round (`INTEGRATION_REPORT.md`, 15 workflow tests) and **re-run unchanged in this round's regression**: categories and cake options reach the catalogue; inventory and cancellations adjust stock once; coupons are enforced by the server; customers and blocking; order status reaches the app; delivery settings change the next order; reports count real orders.

## 6. Do this now (your machine)
1. **Restart your API** (the running one has the old code): stop it, then in `backend`: `npm run dev`. Set `PUBLIC_URL=http://192.168.1.3:4000` in `backend\.env` if you want uploaded image links stored with an address a phone can use (not required: links are already adapted when sent).
2. **Restart the admin panel** if you run `next dev`, it picks up changes itself; otherwise rebuild.
3. **Restart Expo with the new file**: in `mobile`: `npm run start:live`. Confirm in the app: no "Demo data" ribbon on Home, and Account → About says "live store backend" with your server address.
4. Allow Node through Windows Firewall for port 4000 so a phone on the same Wi-Fi can reach `192.168.1.3:4000`; your phone must be on the same network.
5. In pgAdmin open Query Tool on `shree_hari` and run `docs/sql/verify-sync.sql` block by block.

## 7. How to prove "same database, same backend" and "my update really changed the row"
- **Right database:** `backend\.env` → `DATABASE_URL` ends with the database name (default `shree_hari`). `npm run db:check` prints it with the password hidden. In pgAdmin, `SELECT current_database();` must give the same name. Admin → Settings → **System check** shows database name, host, port.
- **Admin and app on the same backend:** admin `admin\.env` → `API_URL`; app `mobile\.env` → `EXPO_PUBLIC_API_URL`. Both must point at the same API (localhost and `192.168.1.3` are the same PC). Stronger proof: admin System check **Catalogue version** equals the app's Account → About **Catalogue version**, and changes after you edit a product.
- **An UPDATE changed a record:** query 2 in `verify-sync.sql` (`"updatedAt"` moves to now), query 8 (`"AuditLog"` has a `product.update` row naming you), query 7 for stock (`"StockMovement"` row with the change and the resulting stock).
- **App API returns the same record:** open `http://localhost:4000/api/catalog` in a browser, find the product; its `price` and `stock` equal query 3 (or the `"ProductVariant"` row). Query 6 shows exactly which products the API will include.

## 8. Remaining issues (honest)
- Nothing was run on a physical phone; the app ran as the web build in a desktop browser. Phone networking (Wi-Fi, firewall, `192.168.1.3`) is untested.
- Image upload through the admin form's file picker, and add-to-cart/checkout of the test product through the app UI, were not clicked through (API tests cover both).
- Change feed is single-process (see section 3).
- A product whose category you pick must be a leaf; existing products already in a parent category (Rasagula) keep working but should be moved in admin to a subcategory (edit → category).
- Push, SMS and WhatsApp sending remain blocked by credentials; online payment checkout in the app is not built.
- The `Delivery in 30–45 mins` chip still carries a DEMO tag (no real delivery tracking exists).
