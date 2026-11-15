# Implementation report

## Architecture
```
mobile/   Expo SDK 58 · React Native · TypeScript · React Navigation · Reanimated · Zustand (persisted)
backend/  Node · Express 5 · TypeScript · Prisma 6 · PostgreSQL · zod · JWT · scrypt
docs/     reports, evidence, screen map, decisions
```
- **Service seam:** screens → `ShopApi` (`services/api.ts`) → `mockApi` (default) or `liveApi` (`EXPO_PUBLIC_USE_MOCK=false`). Auth has the same split: `authApi` = *demo* (device-only accounts, clearly labelled) vs *live* (backend). Network code never imports stores (`services/session.ts` holds the token) — no import cycles.
- **State:** `useShop` keeps one slice per account (`archive`), so logging in/out swaps cart, wishlist, addresses and orders; guest → account merges the cart (`utils/cart.ts`).
- **Design system:** `theme/index.ts` (colours, type, radius, shadow, `layout`, `control`, `iconSize`, `cardSize`); `animations/motion.ts` (all durations/easing/presets).

## What changed in this round
- **Cart-line identity** = size + flavour + message (`lineKey`); stock shared across a size's lines; same rules on the server.
- **Cakes:** category + 9 subcategories + 9 demo cakes; flavour chips, message (max length), delivery-notice; cakes suggest only cakes; Home shortcut, shelf, banner.
- **Auth:** login / signup / forgot-password, validation, double-submit lock, secure token storage (Keychain/Keystore; local storage on web only), checkout gate.
- **Addresses:** GPS on demand (explanation → permission → one reading → editable form → confirm), state/landmark/lat/lon, serviceability check, provider-independent map adapter (no provider configured).
- **Weather:** Home chip (Open-Meteo, 15-min cache, honest states) + backend `/weather` adapter (10-min cache).
- **Motion:** spring/zoom effects removed app-wide; tab bar no longer resizes; stack transitions standardised.
- **Alignment:** card/button/checkout/account fixes found by QA (see audit report).
- **Backend:** auth (scrypt, rate limit, generic login error), profile, addresses, cart (with options), weather, geocode (501 stub), migrations 0002–0003, 30 integration tests.

## What changed in the final-completion round
- **OTP** (`modules/otp`): CSPRNG 6-digit code, HMAC hash bound to the phone, TTL, cooldown, hourly cap, attempt cap, single use; providers `none | dev | twilio` (dev refused in production). Mobile: "Login with a code" screen, shown only when `/capabilities` says OTP is on; a development-mode banner replaces any "SMS sent" claim.
- **Password reset** (`modules/auth/reset.routes.ts`, `modules/email`): 32-byte token, SHA-256 hash stored, 30 min, single use, per-account throttle, generic 202; providers `none | dev | resend`; 503 when unconfigured. Mobile: Forgot + Reset screens, deep link `shreehari://reset-password?token=`.
- **Payments** (`modules/payments`): provider interface, Razorpay REST adapter + test double with identical HMAC logic, signed raw-body webhook, event-id idempotency, amount-mismatch guard, stock release on fail/cancel/expiry, status states PENDING/PROCESSING/PAID/FAILED/CANCELLED/REFUNDED. Online checkout returns `requires_payment`; the app shows an honest result screen (check status / cancel). **No checkout SDK in the app yet.**
- **Reverse geocoding**: Google adapter (`modules/geocode/google.ts`); REQUEST_DENIED/quota → 502, ZERO_RESULTS → 404, never a made-up address.
- **GPS**: explicit state machine (`services/locationCore.ts`) for not-asked, granted, denied, blocked, services off, unavailable, timeout, offline, geocode failure, success; 12 tests.
- **Config**: zod env validation at startup (names only, never values); `GET /api/capabilities` drives optional UI.
- **Tooling**: ESLint (flat config) for mobile and backend, both `--max-warnings=0`; EAS profiles; location/camera permission text in `app.json`.
- Migration `0004_otp_reset_payments` is additive (new tables, new nullable columns, new enum values).

## Admin panel round
New `admin/` Next.js app and ~60 `/api/admin/*` endpoints (dashboard, products, categories, cakes, inventory, orders, returns/refunds, customers, segments, coupons, campaigns, banners, notifications, payments, delivery, reports, settings, staff, audit), migration 0005, stock history via a single `changeStock` helper, coupon category eligibility and admin-editable delivery rules applied to real orders, banner impression/click endpoint (`POST /banner-events`) used by the mobile app. Details and limits: [`ADMIN_PANEL.md`](ADMIN_PANEL.md). A pre-existing routing bug was fixed on the way: `GET /serviceability/:pincode` was behind the customer-only auth router.

## API endpoints (`/api`)
| Method · Path | Auth | Purpose |
|---|---|---|
| GET `/health` | – | liveness |
| GET `/catalog` | – | products (+cake options), categories, collections, banners, coupons |
| GET `/serviceability/:pincode` | – | delivery check |
| POST `/auth/signup` · `/auth/login` | – (rate-limited) | account; returns JWT |
| POST `/auth/forgot-password` · `/auth/reset-password` | – (rate-limited) | reset link by email; 503 `EMAIL_NOT_CONFIGURED` if no provider |
| POST `/auth/otp/request` · `/auth/otp/verify` | – (rate-limited); `verify_phone` purpose needs JWT | OTP login / phone verification; 503 if `OTP_PROVIDER=none` |
| GET `/capabilities` | – | which optional features the server really supports |
| POST `/payments/verify` · GET `/payments/:orderId/status` · POST `/payments/:orderId/cancel` | JWT, owner only | verify client signature, read verified status, cancel an unpaid payment |
| POST `/webhooks/payments` | provider signature (raw body) | authoritative payment events, deduplicated |
| POST `/admin/payments/expire` | JWT + ADMIN | cancel stale unpaid orders (also `npm run jobs:expire-payments`) |
| POST `/auth/demo-login` | – (dev only) | seeded demo customer; refused in production |
| GET `/auth/me` · GET/PATCH `/me` | JWT | profile |
| GET/POST `/me/addresses` · PUT/DELETE `/me/addresses/:id` | JWT, owner only | saved addresses incl. GPS |
| GET/PUT `/me/cart` | JWT | persisted cart (with cake options) |
| POST `/orders` · GET `/orders` · GET `/orders/:id` · POST `/orders/:id/reconcile` | JWT, owner only | idempotent orders |
| POST `/admin/orders/:id/advance` | JWT + ADMIN | status transition |
| POST `/uploads` | JWT | image upload (type sniffed, ≤5 MB) |
| GET `/weather?lat&lon&label` | – | weather adapter |
| GET `/geocode/reverse?lat&lon` | JWT | Google when configured; **501 `GEOCODER_NOT_CONFIGURED`** otherwise |

## Environment variables
**Backend** (`backend/.env.example` lists every one, placeholders only): core (`DATABASE_URL`, `JWT_SECRET` ≥16 chars, `PORT`, `CORS_ORIGINS`, `PUBLIC_URL`, `UPLOAD_DIR`), auth (`ENABLE_DEMO_LOGIN` must be `false` in production, `AUTH_RATE_LIMIT_PER_MIN`), geocoder (`GEOCODER_PROVIDER`, `GOOGLE_MAPS_API_KEY`), OTP (`OTP_PROVIDER`, `OTP_*`, `TWILIO_*`), email (`EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `APP_RESET_URL_BASE`, `RESET_TOKEN_TTL_MINUTES`), payments (`PAYMENT_PROVIDER`, `RAZORPAY_*`, `PAYMENT_PENDING_TTL_MINUTES`). Startup refuses: a selected provider with missing credentials, and in production any `dev`/`test` provider or demo login. Setup steps: `EXTERNAL_INTEGRATION_SETUP.md`.
**Mobile**: `EXPO_PUBLIC_USE_MOCK` (default `true`), `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_MAP_PROVIDER` (`none`). Public variables are not secrets.

## Security notes
scrypt-hashed passwords (never returned, never logged); same 401 message for unknown user and wrong password; JWT-guarded customer routes with ownership in the query (other customers' data returns 404); zod validation; rate limits on credentials and checkout; helmet + CORS allow-list; upload type sniffed from bytes; server recalculates all prices; transactions + conditional updates for stock and coupon caps; append-only ledger enforced by a DB trigger. Also: OTP codes and reset tokens stored only as hashes; payment signatures compared in constant time; webhook body verified before parsing; provider secrets exist only in server env. **Not reviewed:** a full external security audit, JWT refresh/revocation (a password reset does not sign out existing sessions), CSRF (token-in-header API), account lockout beyond rate limiting.
