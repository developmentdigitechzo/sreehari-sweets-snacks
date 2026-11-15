# Testing report

## Automated (all re-run for this report; outputs in `docs/evidence/`)
| Suite | Command | Result |
|---|---|---|
| Mobile typecheck | `cd mobile && npm run typecheck` | clean |
| Mobile ESLint | `npm run lint` (`--max-warnings=0`) | clean |
| Mobile unit tests | `npm test` | **27 / 27 pass** (incl. 12 GPS state-machine tests) |
| Mobile config health | `expo-doctor` | **20 / 20 checks pass** |
| Mobile native bundles | `expo export --platform android` and `ios` | both compile (proves JS builds; **not** a device test) |
| Backend typecheck + build | `cd backend && npm run typecheck && npm run build` | clean |
| Backend ESLint | `npm run lint` (`--max-warnings=0`) | clean |
| Backend unit tests | `npm test` | **53 / 53 pass** (pricing, passwords, OTP policy, email, payment signatures, geocoder parsing, env validation, admin permissions, CSV safety, message senders with a fake HTTP layer); no network/DB/SMS/email/payment calls |
| Backend integration, API (real PostgreSQL 18) | `API_URL=… npm run test:integration` | **30 / 30 pass** |
| Backend integration, OTP / reset / payments (real PostgreSQL, `dev`/`test` providers) | `npm run test:flows` | **25 / 25 pass** |
| Backend integration, admin API (real PostgreSQL) | `npm run test:admin` | **33 / 33 pass**: staff login, permissions (manager vs super admin, live role check), product/category/inventory/orders/returns/refunds, customers, coupons with category eligibility, banners with tracked events, delivery settings changing a real order total, notifications (in-app delivered; SMS/WhatsApp/push refused when not connected), segments, reports + CSV, audit |
| Backend integration, admin + app workflows (real PostgreSQL) | `npm run test:workflows` | **15 / 15 pass** (product/category sync, order status sync, inventory and concurrency, customers and blocking, coupons and delivery rules, returns, consistency) |
| Backend integration, **sync** scenario (real PostgreSQL) | `npm run test:sync` | **13 / 13 pass**: SYNC TEST SWEET 001 create → price → image → unpublish → publish → stock → archive, each checked in the admin API, the PostgreSQL row and the app API; change feed, ETag/304, cache headers, parent-category legacy product |
| Admin app | `cd admin && npm run typecheck && npm run lint && npm run build` | clean; 28 pages build |
| Migrations 0001–0005 (fresh) and 0001+0002 → 0003 upgrade with data | `docs/evidence/db-migration-test.txt` | pass (0004 applied on fresh DB only; not run against an upgraded database with data) |

Raw output: `docs/evidence/`. Note: the first run of the payments flows in this round failed 3 tests because the tests reused fixed provider payment ids on a database that already held them (unique constraint). The ids are now unique per run; the application behaviour was correct. Results above are from a freshly migrated and seeded database.

Not automated: Razorpay, Twilio, Resend and Google calls (no credentials; see `EXTERNAL_INTEGRATION_SETUP.md`).

Mobile unit tests cover: pricing (₹706 demo cart), coupon rules, search + typo tolerance, validation (phone/email/password), cart merge, address merge, stock caps, **customised-cake line identity**, shared stock across lines, SKU/ID uniqueness, "cake images are never sweets images".

## Browser verification (Expo web, react-native-web)
Done by driving the real UI. **A browser is not proof of native Android/iOS behaviour.**
| Viewport | Screens checked |
|---|---|
| 360×640 | Home, Cakes listing, Product (cake options), Cart, Account |
| 375×812 | Home (twice), Cakes → product → customised add ×2 → Cart, Login (validation errors), Signup (full form, success), Checkout, Address sheet (GPS explanation, denied, granted-stub) |
| 390×844 | (earlier session) Home, Categories, Search, Product, Cart, Checkout, Payment, Result, Tracking, Account, Offers |
| 430×932 | Account, Home |

Not every screen was checked at every size.

### End-to-end scenarios run in the browser
- Guest browses → opens Cakes → picks flavour + message → adds → changes flavour/message → adds again → **cart shows 2 separate lines**.
- Guest taps Checkout → redirected to Login with "your cart will be kept" → Create account → success screen → **lands on Checkout with the cart intact (2 items, ₹940)**; Continue is blocked until an address exists.
- Address sheet: location explanation shown **before** any permission request → permission denied path (clear message, manual entry kept) → granted path (stubbed browser GPS): coordinates captured, **no invented address**, map-not-configured notice.
- Login with empty fields → inline errors for both fields. Session persisted across reload.
- DOM check: 0 nested buttons (215 buttons).

### Responsive spot-check (this round, browser emulation only)
Home screen reloaded at each size; looked for clipped text, overlapping tab bar, horizontal page scroll (`scrollWidth == width` at 360).
| Viewport | Result |
|---|---|
| 360×640 | OK: header, search, weather row, banner, tab bar fit; no horizontal scroll |
| 375×812 | OK |
| 390×844 | OK |
| 430×932 | OK |
| 768×1024 | No overflow or clipping, but the **phone layout simply stretches** (no tablet-specific layout) |
Other screens (Login, Signup, Cart, Checkout, Account…) were checked at 360/375/390/430 in earlier rounds (table above), **not re-run at all five sizes this round**, and the new screens (OTP login, reset password, payment-required result) were not visually checked in a browser at any size.

## Scenario coverage vs. the brief
| Scenario | Status | How |
|---|---|---|
| Signup success / invalid / duplicate | DONE | browser + integration (400/409) |
| Login success / invalid, same message for unknown user | DONE | integration |
| Forgot-password / reset | DONE on server (no enumeration, hashed single-use token, expiry, reuse refused, 503 when email unconfigured); real email **BLOCKED BY CREDENTIALS** | `test:flows` (7) |
| OTP login / verify phone | DONE with development provider (hash-only storage, attempts, cooldown, expiry, single use); real SMS **BLOCKED BY CREDENTIALS** | `test:flows` (8) + unit tests |
| Online payment lifecycle | DONE on server with the test provider (forged/tampered signatures refused, webhook dedupe, amount mismatch, late capture, refund, expiry, cross-customer); Razorpay sandbox **BLOCKED BY CREDENTIALS**; in-app checkout **NOT DONE** | `test:flows` (10) + unit |
| Logout | PARTIALLY | code path; archives data, guest cart empty — not clicked in browser |
| Browse, details, add, quantity, remove | DONE | browser (earlier) + unit |
| Cake: size, flavour, message, multiple customised cakes | DONE | browser + unit + PostgreSQL |
| Address: manual add / edit / delete | DONE (API) · PARTIALLY (UI: add sheet seen; edit/delete UI not re-checked this round) | integration |
| GPS: denied | DONE | browser |
| GPS: granted | PARTIALLY | stubbed browser API only |
| GPS: blocked / services disabled / unavailable | PARTIALLY | code paths + messages written; **cannot be triggered in a browser** |
| Guest cart merge, duplicates, stock | DONE | unit + browser |
| Stock validation / final unit race | DONE | PostgreSQL |
| Checkout auth gate | DONE | browser |
| Weather success / cache / failure / invalid city | DONE (API) · PARTIALLY (UI: "choose city" state seen; live weather chip with a city not re-checked) | integration |
| Reduced motion | PARTIALLY | all presets use `ReduceMotion.System`; not toggled on a device |
| Slow network / offline | PARTIALLY | error + retry states exist; not throttled in a test |

## Android / iOS — BLOCKED
No Android SDK, Java, emulator, physical device, Xcode or Mac was available. **Nothing was tested natively.**
How to run it yourself:
1. Phone and PC on the same Wi-Fi; install **Expo Go**.
2. `cd mobile && npm install && npm start`, scan the QR (use `--tunnel` if the network blocks it).
3. Checklist per device (small / standard / large): app launch; tab navigation; keyboard on Login/Signup/address form (fields not covered); safe areas (notch, gesture bar); location permission allow / deny / "don't ask again" / GPS off; image picker (profile photo); share sheet; airplane mode on Home/checkout; background → foreground; kill and relaunch (still signed in, cart kept).
4. For release builds use EAS Build (`npx eas-cli build`); iOS needs an Apple developer account.

## Known test gaps
- **Component tests (React Native Testing Library): NOT DONE.** Tab bar, header badge, product card, cake customisation, quantity stepper, forms, GPS UI, cart and loading/error states are covered only by logic unit tests plus manual browser checks.
- Automated UI / E2E on a device or emulator: NOT DONE (BLOCKED BY HARDWARE). UI journeys were driven by hand in a browser; API journeys are covered by the integration suites.
- Load/performance tests and a screen-reader accessibility audit: NOT DONE.
- Device setup and a ready-to-tick native checklist: `MOBILE_DEVICE_SETUP.md`.


## Admin panel (this round)
- Real browser run against the real API and PostgreSQL: staff sign-in, dashboard with live data, orders list, **order status change from the phone-width panel (saved in PostgreSQL and written to the audit log)**.
- Responsive (browser emulation, measured as document width vs viewport width): **320 px: all 26 admin pages** (two real overflow bugs found and fixed on Notifications and Delivery; the product edit page `/products/[id]` shares the add-product form but was not loaded separately); **375 px**: login, orders (list, cards and the full-screen order sheet), products; **768 px**: 10 pages (dashboard, products, add product, orders, notifications, banners, delivery, segments, reports, returns); **1440 px**: dashboard, orders, products (visual check). **1024 px was not checked page by page.** Below 1024 px the sidebar is a drawer; below 768 px tables become stacked cards.
- **Not tested:** the panel on real phones/tablets, other browsers (Chrome-based only), screen-reader use, Razorpay refunds, Twilio/WhatsApp/Expo Push with real credentials, image upload through the panel UI (the API upload is covered by the earlier suite; the panel uploader was not exercised end to end), and the customer app receiving banner tracking on a device.
- Raw output: `evidence/backend-admin-postgres.txt`, `evidence/admin-checks.txt`.


## Admin + app integration round
Live browser run (Expo web in live mode against the real API): catalogue loaded from the API, banner views reported, server order shown in Orders and tracking, **admin status change appeared on the open tracking screen within 15 s**, in-app cancellation request (with validation) approved in admin and shown as Cancelled, messages inbox with real messages. Details and what was not driven through the UI: [`INTEGRATION_REPORT.md`](INTEGRATION_REPORT.md). Final checks: backend/admin/mobile typecheck and lint clean, Android production bundle and admin production build succeed. Not tested: real devices, payment/SMS/push providers.


## Synchronisation round
See [`SYNC_REPORT.md`](SYNC_REPORT.md): root cause (the app ran in demo mode, plus category/flag/image/refresh gaps), the step table with database and API evidence, a real-browser run of admin and app side by side, and the 24 pgAdmin queries validated against the real schema. Not tested: physical phones.
