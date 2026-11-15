# Product synchronisation audit: "admin product not showing in the mobile app"

Status: **investigation only. No code, data or configuration has been changed.** Awaiting approval of section 5.

## 1. What was reproduced (your real database and running servers)
Read-only checks against your running stack (API :4000, admin :3000, Expo :8081, PostgreSQL `shree_hari`):

| Step | Finding |
|---|---|
| Product created in admin | **Saved correctly.** `rasagula` exists in PostgreSQL: published, not archived, price ₹250, MRP ₹350, stock 5, SKU `SW-090-2026`, one image. |
| Backend API | **Returns it.** `GET /api/catalog` (the endpoint the app uses) contains `rasagula` (26 published products). The archived `brithday-cake` is correctly absent. |
| Mobile app | **Never asks for it.** See root cause 1. |

So admin → backend → PostgreSQL → catalogue API works. The break is between the API and the app.

## 2. Root causes (evidence-based)

### Root cause 1 (confirmed, the reason you see nothing): the app is running in demo mode
- `mobile/.env` does not exist, and Expo was started as plain `expo start`.
- The app only talks to the backend when `EXPO_PUBLIC_USE_MOCK=false` (`mobile/src/data/config.ts`: `USE_MOCK_API = (env ?? 'true') !== 'false'`).
- The **running Expo bundle** (fetched from :8081) contains no `EXPO_PUBLIC_USE_MOCK` value, so it resolves to demo mode and uses the built-in demo catalogue (`data/seed.ts`). It never calls `/api/catalog`.
- Affected: mobile launch configuration (not the backend or admin).

### Root cause 2 (confirmed in live mode): category mapping hides parent-category products
- Admin lets a product be saved in a **top-level** category. `rasagula` is in `sweets` (top level).
- The app's Sweets/Snacks/Cakes tabs filter by each collection's `categoryIds`, which list only **subcategories** (`milk-sweets, kaju-sweets, laddu, halwa-burfi, traditional-sweets`). `sweets` itself is not in that list, so the product is excluded from the Sweets collection.
- Home tile "Sweets" and the category chips use the collection → product missing. Only search, "All Products", or the Categories tile for the parent category would show it. Inconsistent.
- Affected: `/catalog` collections, mobile `SearchScreen` collection scope, admin product form (no guidance).

### Root cause 3 (confirmed): new products do not appear on Home
- Home shelves are built from flags (`featured.bestseller / newArrival / festive`) or the `cake` tag. `rasagula` has all flags false.
- Affected: mobile `HomeScreen`, admin form (flags are opt-in, unexplained).

### Root cause 4 (confirmed): image address only works on the computer
- Upload stored `http://localhost:4000/uploads/…` (from `PUBLIC_URL=http://localhost:4000`). On a phone or Expo Go, `localhost` is the phone, so the image fails and the placeholder shows. It loads fine in the browser on this PC (HTTP 200). This PC's LAN address is 192.168.1.3.
- Affected: backend `PUBLIC_URL` setting and the stored URL.

### Root cause 5 (confirmed by code): the app only reloads the catalogue at start-up
- Catalogue loads on the splash screen and on pull-to-refresh. A product added later does not appear until the app is restarted or pulled down.
- Affected: mobile `useCatalog` refresh policy.

Ruled out: different databases (one DB, one API), wrong endpoint, API filtering (published/stock/category filters in `/catalog` are correct), response format, admin save failing.

## 3. Other findings from the audit
**Demo-only behaviour that stays visible in live mode** (mobile): referral code `RAMESH100` and points rules text come from `DEMO_CONFIG`; "(demo)" labels on reward lines; "Help with this order" shows a demo message instead of the store's contact details; the delivery-fee info bubble says "Demo delivery fee"; "Manage product photos (demo)" lets a customer swap product images **on their own phone only**.
**Admin:** every module has real create/read/update/archive paths backed by PostgreSQL (verified by 103 integration tests earlier, plus browser checks of 8 pages). No dead buttons were found by code scan. Product **delete** is not offered (archive only; history must stay). The category picker offers parent categories (root cause 2).
**Data:** 27 products (26 published, 1 archived), 1 order, 2 customers, 1 staff account. Nothing needs repair.

## 4. Module audit (status as verified; "UI" = driven in a browser)
| Area | Result | Evidence / gap |
|---|---|---|
| Admin: products, categories, cakes, inventory, orders, customers, coupons, payments, delivery, reports, settings, staff, audit | API **Pass** | integration suites; browser-checked: dashboard, orders, products, plus layout checks of all pages at 320 px |
| Admin: notifications | Pass for in-app; **SMS/WhatsApp/push blocked by credentials** | |
| Mobile in **live** mode: login, signup, address, cart, checkout (COD), order list/tracking/status sync, cancellation request, inbox, coupons, delivery rules | Pass | 15 workflow tests + live browser run |
| Mobile in **demo** mode (your current setup) | Works as a demo; **shows no store data** | root cause 1 |
| Mobile: product listing of new products | **Fail** until fixes 2, 3, 5 | root causes 2, 3, 5 |
| Mobile: product images from uploads on a phone | **Fail** until fix 4 | root cause 4 |
| Real devices, payments, SMS/push | Not tested | no hardware/credentials |

## 5. Proposed fixes (nothing applied yet)
| # | Fix | Touches | Risk |
|---|---|---|---|
| 1 | Create `mobile/.env` with `EXPO_PUBLIC_USE_MOCK=false` and `EXPO_PUBLIC_API_URL=http://192.168.1.3:4000/api`; add `npm run start:live`; show a clear **"Demo data"** ribbon on Home whenever the app is in demo mode so this cannot be missed again; restart Expo with `--clear` | mobile config + one small UI badge | none to data |
| 2 | `/catalog` expands each collection to include its whole category branch (a collection named like a root category also covers every subcategory and the root itself, so new subcategories and parent-category products appear automatically). Admin product form: show categories as "Parent › Subcategory" and require a subcategory when a category has children (server-validated) | backend catalogue, admin form, validation | low; existing products unaffected |
| 3 | `/catalog` marks products created in the last 14 days as `newArrival` (computed, nothing written to the database) so a new sweet shows on Home "New" automatically; add a hint in the admin form about Home flags | backend catalogue, admin form hint | low |
| 4 | Set `PUBLIC_URL` in `backend/.env` to the address phones can reach (`http://192.168.1.3:4000` for testing); at read time rewrite old `…/uploads/…` URLs to the current `PUBLIC_URL` so existing images (e.g. Rasagula) work without editing data | backend config + catalogue/admin responses | low; no data change |
| 5 | Refresh the catalogue when the app returns to the foreground and when a screen opens with data older than 60 s; refresh after placing an order | mobile `useCatalog` | low |
| 6 | Live-mode clean-up: hide the referral section and "(demo)" labels, show the store's contact details (from Business Settings) in "Help with this order", hide the on-device product-photo editor | mobile screens, `/catalog` returns store contact | low |
| 7 | Tests: extend the workflow suite with the exact failure (product in a parent category, no flags, uploaded image URL) and assert the app's filter logic finds it; unit-test the collection/branch expansion | backend + mobile tests | none |
| 8 | Re-run everything: typecheck, lint, unit, integration, workflow tests, builds, and a live browser pass creating a product in admin and finding it in the app (Home, Sweets tab, search, category, product page, cart, checkout) | | |

No migration is needed. No data is deleted or reset.

## 6. Decisions
1. Fix 4 default: use `http://192.168.1.3:4000` as `PUBLIC_URL` now (works on your Wi-Fi; change it when you deploy). OK?
2. Fix 2: should admin **block** saving a product in a top-level category that has subcategories (recommended), or just warn?
3. Fix 6: hide the referral and photo-editor sections in live mode (recommended), or keep them as demo features?

## 7. How to confirm root cause 1 right now (no code change)
In the app: **Account → About** says "Data source: built-in mock service". To switch today, in the `mobile` folder run `$env:EXPO_PUBLIC_USE_MOCK="false"; $env:EXPO_PUBLIC_API_URL="http://192.168.1.3:4000/api"; npm start -- --clear`, then reload the app: the catalogue will come from the database and Rasagula will be searchable (it will still be missing from the Sweets tab and Home until fixes 2 and 3).
