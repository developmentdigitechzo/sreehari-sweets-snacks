# Final delivery report

Status key: **DONE** implemented and verified · **PARTIALLY DONE** implemented, some verification remains · **BLOCKED** needs an external credential, service or hardware · **NOT DONE**.
Evidence: [`docs/evidence/`](evidence/). Details: [Audit](FINAL_AUDIT_REPORT.md) · [Testing](TESTING_REPORT.md) · [Database](DATABASE_MIGRATION_REPORT.md) · [Implementation](IMPLEMENTATION_REPORT.md).

## 1. Features verified
| Item | Status |
|---|---|
| Mobile + backend typecheck, build | DONE |
| Mobile unit tests (15), backend unit tests (11) | DONE |
| Backend on real PostgreSQL (30 integration tests) | DONE |
| Migrations 0001–0003, fresh and upgrade | DONE |
| Calm motion system, reduced-motion presets | DONE (code) · reduced-motion not toggled on a device |
| 5-tab navigation, cart in header, no hamburger | DONE |
| Login / signup / forgot password / validation / duplicate-submit lock / session persistence | DONE (demo + backend) |
| Guest cart merge on login | DONE |
| Cart: stock caps, persistence, totals, customised lines | DONE |
| Weather (real data, cache, honest failure) | DONE |
| Nested-button warning | DONE (DOM-verified) |

## 2. Previously incomplete, now completed
Customised-cake cart identity · PostgreSQL verification · SKU uniqueness · cake-only suggestions · account-scoped data · map adapter structure · cart/order options on the server · configurable auth rate limit.

## 3. UI/UX improvements
Standardised button/label behaviour (no wrapping), shelf-card overflow fix, two-line product names with fixed height, Account labels shortened, initials avatar, checkout header spacing, honest delivery-location label for guests, inline form validation, clear demo/real labelling, explanation-before-permission for GPS.

## 4–6. Backend, database and API changes
See Implementation and Database reports. New: `/auth/*`, `/me/*`, `/weather`, `/geocode/reverse`; migrations 0002, 0003.

## 7. Security improvements
scrypt hashing, generic login error, rate limiting, ownership-scoped queries, server-side price/stock/coupon enforcement, secure token storage on devices, demo login disabled in production.

## 8. Automated results
Mobile 15/15 · Backend unit 11/11 · Integration 30/30 (PostgreSQL 18).

## 9. Android — **BLOCKED** (no SDK/emulator/device here). Nothing was run natively.
## 10. iOS — **BLOCKED** (no Mac/Xcode/device). Nothing was run natively.
## 11. Responsive results
Browser-checked at 360×640, 375×812, 390×844, 430×932 on the screens listed in the Testing report. **PARTIALLY DONE** (not every screen at every size; browser ≠ native).

## 12. Acceptance status
| Requirement | Status |
|---|---|
| GPS: explanation, on-demand permission, denied, confirm-before-save | DONE (browser) |
| GPS: real device reading, blocked/disabled states | PARTIALLY DONE — code written, not exercised on a device |
| Reverse geocoding (coordinates → address) | **BLOCKED** — native platform geocoder not exercised; backend provider not configured (API answers 501) |
| Map preview + draggable pin | **BLOCKED** — adapter ready (`services/maps.ts`); needs a provider package and API key |
| Unique, high-resolution cake images | **BLOCKED** — 5 low-res AI previews exist, several cakes share one; see inventory |
| Real OTP/SMS verification | **BLOCKED** — no provider; nothing claims it |
| Forgot-password by email/SMS | **BLOCKED** — endpoint states honestly that nothing is sent |
| Payment gateway | **BLOCKED** — payments are simulated (labelled) |
| Push/SMS notifications | **BLOCKED** — simulated |
| ESLint | **NOT DONE** — not configured |
| Component tests (RNTL) / on-device E2E | **NOT DONE** |
| Delivery date/time selection for cakes | **NOT DONE** by design — business decision pending (UI says so) |
| Admin portal | **NOT DONE** — out of scope for the mobile app |

## 13. External credentials / decisions still required
Map provider + API key · reverse-geocoding provider · SMS/email provider (OTP, password reset) · payment gateway + webhook secret · push provider · approved product photography · delivery areas/fees/slots · cake lead times and customisation rules · Apple/Google developer accounts · privacy policy / terms URLs.

## 14. Exact commands
```bash
# Mobile (mock backend, works offline)
cd mobile && npm install && npm start          # w = web, scan QR with Expo Go for a phone
npm run typecheck && npm test

# Backend (needs PostgreSQL 14+, UTF8 database)
cd backend && cp .env.example .env              # set DATABASE_URL, JWT_SECRET
npm install
node node_modules/prisma/build/index.js migrate deploy
npm run seed && npm run dev
npm run typecheck && npm run build && npm test
API_URL=http://localhost:4000/api npm run test:integration   # use a THROWAWAY database

# Point the app at the backend
EXPO_PUBLIC_USE_MOCK=false EXPO_PUBLIC_API_URL=http://<your-ip>:4000/api npm start
```
(The `&` in this folder's name breaks `npx`; the scripts call `node …` directly. Renaming the folder avoids it.)

## 15. Production readiness: **NOT READY**
Blocking: native device testing, payment gateway, OTP/SMS, real product photography, map/geocoding provider, security review, privacy/terms, store listings, monitoring/backups. This is a verified, demonstrable POC with a tested backend foundation.
