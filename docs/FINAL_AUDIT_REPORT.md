# Final audit report

Audit date: 2 Nov 2026. Method: every item previously reported as "done" was re-checked by running code, not by trusting the earlier report.
Raw outputs are in [`docs/evidence/`](evidence/).

| Feature | Reported status | Actual status | Evidence | Action taken |
|---|---|---|---|---|
| Mobile typecheck | Done | **DONE** (clean) | `evidence/mobile-checks.txt` | none needed |
| Mobile unit tests | Done (9) | **DONE** — now **15** pass | same | added 6: customised-cake line identity, stock sharing, SKU uniqueness |
| Backend typecheck / build | Done | **DONE** (clean, `tsc -p` build exits 0) | `evidence/backend-checks.txt` | none |
| Backend unit tests | Done (11) | **DONE** — 11 pass | same | none |
| Backend vs real PostgreSQL | **Unverified** | **DONE** — 30/30 integration tests pass on PostgreSQL 18 | `evidence/backend-integration-postgres.txt` | wrote the suite; found and fixed 2 bugs (below) |
| Migrations 0001–0003 | Unverified | **DONE** on a fresh DB **and** as an upgrade of a DB with existing rows | `evidence/db-migration-test.txt`, `DATABASE_MIGRATION_REPORT.md` | added migration 0003 |
| Animations (`motion.ts`) | Done | **DONE** (code review + UI) | no `springify`/`withSpring`/`ZoomIn` left outside `motion.ts` timing presets; all entering/layout presets use `ReduceMotion.System` | none |
| Navigation (5 tabs, no hamburger) | Done | **DONE** — verified in browser | screenshots at 360/375/430 | none |
| Authentication | Done | **DONE (demo + backend)**; OTP/SMS **BLOCKED** (no provider) | browser signup/login/validation; 8 auth integration tests | none |
| Guest cart → account merge | Done | **DONE** — verified in browser (2 customised cakes survived signup) + unit tests | screenshots, tests | none |
| Cart | Done | **DONE**, but had a **design flaw** (below) — fixed | tests + browser | cart-line identity redesigned |
| Cakes module | Done | **PARTIALLY DONE** — logic/UI done; imagery limited | browser, `IMAGE_ASSET_INVENTORY.md` | related-products bug fixed; images still blocked |
| GPS address | Unverified | **PARTIALLY DONE** — denied + granted(stubbed) paths verified in browser; real device GPS **BLOCKED** | browser | provider-independent map adapter added |
| Maps / reverse geocoding | Not done | **BLOCKED** — adapter built, no provider/keys | `services/maps.ts`, `geocode.routes.ts` (501) | documented setup |
| Weather | Done | **DONE** — real Open-Meteo data via API; cached; honest error state | integration test (400, 200/502, cache, no invention) | none |
| Backend APIs (profile, addresses, cart, weather, geocode) | Done | **DONE** — ownership/IDOR/validation verified on PostgreSQL | integration tests | none |
| Nested-button console warning | "Fixed" | **DONE** — verified: 0 `button` inside `button` in the DOM (215 buttons) | JS DOM check | none |
| SVG `transform-origin` warning | Open | **NOT DONE** — web-only, harmless, from `react-native-svg` | console | left; documented |
| Android / iOS device testing | Not done | **BLOCKED** — no SDK/emulator/device/Mac here | — | test plan in `TESTING_REPORT.md` |
| Lint | Not done | **NOT DONE** — ESLint not configured in the project | — | listed as remaining |
| Documentation | Pending | **DONE** | this folder | — |

## Defects found by this audit (and fixed)

1. **Cart line identity (design flaw):** a cart line was identified by size only, so two cakes of one size with different flavour/message overwrote each other. Now identified by size + flavour + message (`lineKey`); stock is enforced per size across all of its customised lines. Backend cart/order items carry the same key. *Regression-tested on mobile and PostgreSQL.*
2. **Non-unique SKUs (found by the real database):** demo products generated duplicate SKUs (e.g. several "SH-MYSORE-…"), violating the BRD rule "every sellable variant has a unique SKU" and breaking the seed on PostgreSQL. SKU now derives from the full product slug; a test guards it.
3. **Database encoding (found by the real database):** a Windows default cluster used `WIN1252` and could not store "₹". Production/test databases must be `UTF8` (documented).
4. **Cake "You may also like" suggested sweets** (matched on name words). Cakes now suggest only cakes.
5. **Layout defects at narrow widths:** "Options" button spilling out of shelf cards; "Add to Cart"/"Checkout" labels wrapping or truncating; checkout heading colliding with its link; truncated Account labels.
6. **New customers were shown the demo customer's photo.** Now an initials avatar.
7. **Nested buttons** inside product cards (invalid DOM on web) — card restructured.
8. **Import cycle** (`useCatalog → api → liveApi → useAuth → useShop → useCatalog`) — broken with a tiny `session` module.

## Not accepted as done without evidence
Anything marked BLOCKED or NOT DONE above. See [`FINAL_DELIVERY_REPORT.md`](FINAL_DELIVERY_REPORT.md) for the status of every acceptance item.
