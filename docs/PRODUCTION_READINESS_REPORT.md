# Production readiness report

**Verdict: not ready for public launch.** The backend, database and business logic are real and tested on PostgreSQL. What stands
between this build and customers is almost entirely things that need *your* accounts or a physical phone: real SMS, email,
maps, payment checkout, native-device testing and store packaging. Nothing below is marked done unless it was executed.

Classification: **DONE** · **BLOCKED BY CREDENTIALS** · **BLOCKED BY HARDWARE** · **PARTIALLY DONE** · **NOT DONE**

## Feature status

| Area | Status | Evidence / what is true |
|---|---|---|
| Catalogue, cart, cake customisation, cart line identity | DONE | unit + PostgreSQL integration + browser |
| Signup / login / logout (server, scrypt, rate limit) | DONE | 30 API integration tests |
| Addresses incl. GPS fields, serviceability | DONE | integration + browser |
| PostgreSQL persistence, migrations 0001–0004, seed repeatable | DONE | `docs/evidence/db-migration-test.txt`; additive, no destructive change |
| Weather (Open-Meteo, cache, honest failure) | DONE | integration + browser |
| GPS logic (every state, no fake coordinates, no launch prompt) | DONE (logic) | 12 tests; denied path + stubbed grant in a browser |
| GPS on a real device (granted, blocked, services off, accuracy) | **BLOCKED BY HARDWARE** | checklist in `MOBILE_DEVICE_SETUP.md` |
| Reverse geocoding (Google adapter, honest errors) | **BLOCKED BY CREDENTIALS** | parsing/error mapping unit-tested; never called Google. Endpoint returns 501 until configured |
| Map preview, marker, draggable pin | **PARTIALLY DONE** | provider seam + UI states only; no map renders. Needs key + development build |
| OTP generation / verify / limits | DONE | 8 integration tests, unit tests (dev provider) |
| OTP real SMS (Twilio) | **BLOCKED BY CREDENTIALS** | adapter tested against a fake HTTP layer only; India needs DLT registration |
| Password reset (token, hash, expiry, single use, no enumeration) | DONE | 7 integration tests (dev outbox) |
| Password reset real email (Resend) | **BLOCKED BY CREDENTIALS** | endpoint answers 503 when unconfigured; app says so |
| Payments: server flow, signatures, webhook idempotency, expiry, refund | DONE | 10 integration tests + unit tests with the test double |
| Payments: Razorpay sandbox end to end | **BLOCKED BY CREDENTIALS** | adapter written to the Razorpay REST contract, never called |
| Payments: in-app checkout UI | **NOT DONE** | needs `react-native-razorpay` in a development build. App shows an honest "complete your payment" result; COD works |
| Payment simulator (demo) | DONE, labelled SIMULATED, hidden when real payments are enabled | |
| ESLint (mobile + backend), typecheck | DONE | both `--max-warnings=0`; two React-Compiler advisory rules disabled individually in mobile with a comment |
| Unit tests | DONE | mobile 27, backend 37 |
| Component tests (RNTL) | **NOT DONE** | |
| Automated UI / E2E on device | **BLOCKED BY HARDWARE** | |
| Native Android / iOS run | **BLOCKED BY HARDWARE** | no SDK, emulator, Mac or phone; `expo export` compiles both bundles; `expo-doctor` 20/20 |
| Responsive (360, 375, 390, 430, 768) | PARTIALLY DONE | Home verified at all five in a browser; tablet is a stretched phone layout; other screens not re-run at every size this round |
| Admin panel (web): login, roles, dashboard, products, categories, cakes, inventory, orders, returns/refunds, customers, segments, coupons, campaigns, banners, payments, delivery, reports, settings, audit | DONE | 33 admin API tests on PostgreSQL, build/lint/typecheck clean, browser-checked; see ADMIN_PANEL.md |
| Admin: SMS / WhatsApp / push sending | **BLOCKED BY CREDENTIALS** | code + tests with a fake HTTP layer; panel refuses to send and says so. In-app messages work |
| Admin: gateway refunds (Razorpay) | **BLOCKED BY CREDENTIALS** | manual refund recording works and is audited |
| Admin ↔ app synchronisation (products, prices, stock, orders and status, customers, coupons, delivery rules, returns, messages) | DONE (API + live browser) | 15 end-to-end tests + live run; see INTEGRATION_REPORT.md. Not run on real devices |
| Customer app: return/cancel request, messages inbox, marketing opt-in, banner tracking | DONE (live mode; cancel + inbox browser-checked) | |
| Push-token registration in the app | **NOT DONE** | needs expo-notifications + development build; push also blocked by credentials |
| Delivery tracking | NOT DONE | simulated/labelled |
| Store packaging (icons, listings, privacy policy, signing) | NOT DONE | `eas.json` profiles exist; needs accounts |
| Accessibility audit with a screen reader, load testing | NOT DONE | |

## Test evidence (all re-run on a freshly migrated PostgreSQL 18)
Mobile: typecheck, lint, 27/27, expo-doctor 20/20 → `docs/evidence/mobile-checks.txt`.
Backend: typecheck, lint, 37/37 unit; 30/30 API integration; 25/25 OTP/reset/payments flows →
`docs/evidence/backend-*.txt`. Migration test → `docs/evidence/db-migration-test.txt`.
One honest note: the payments flow suite failed 3 tests on a reused database (fixed test ids collided with rows from an earlier run); the tests now use per-run ids and pass on a clean database.

## What you must provide / do (in order)
1. **Rename the project folder** to remove `&` (native builds are unreliable otherwise).
2. **Run on a phone with Expo Go** and tick the checklist in `MOBILE_DEVICE_SETUP.md` (GPS, keyboard, safe areas, image picker). This is the cheapest high-value step.
3. **Google Maps Platform key** → reverse geocoding on the server; later map keys for the app (`EXTERNAL_INTEGRATION_SETUP.md` §1–2).
4. **Twilio** (or an Indian SMS gateway) + DLT registration → real OTP (§3).
5. **Resend** + verified domain → password-reset email (§4).
6. **Razorpay test keys** → sandbox payments; then add the checkout SDK in a development build and test with Razorpay's published test credentials (§5). Live keys only after you explicitly authorize.
7. **Hosting**: a managed PostgreSQL (UTF8), a Node host with HTTPS, the webhook URL registered with Razorpay, a scheduled `jobs:expire-payments`.
8. **Business decisions** currently demo values: delivery fee, slots, free-delivery threshold, COD limit, pincodes, coupons, rewards, referral values, cake lead time, real product photography and prices.
9. **Legal/store**: privacy policy and terms (the app collects phone, email, address, location), Apple Developer / Google Play accounts.

## Deployment configuration checklist
- `NODE_ENV=production`; `ENABLE_DEMO_LOGIN=false`; `OTP_PROVIDER`, `EMAIL_PROVIDER` ≠ `dev`; `PAYMENT_PROVIDER` ≠ `test` (startup refuses otherwise).
- Strong `JWT_SECRET` (32+ random bytes); `CORS_ORIGINS` limited to real origins; `PUBLIC_URL` is the HTTPS API URL.
- Secrets in the host's secret store, never in git or in `EXPO_PUBLIC_*`. Rotate any key that has ever been pasted into chat or a file.
- Mobile build: `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_URL=https://…/api` (the `production` EAS profile sets mock off).
- Run `prisma migrate deploy` against a **backup-verified** database; migration 0004 only adds tables/columns/enum values.

## Known limitations that matter for launch
- Existing sessions stay valid after a password reset (no token revocation / refresh tokens).
- Real payment confirmation depends on the webhook reaching the server; the app can poll status but cannot take a payment itself yet.
- Server-side rate limiting is in-process memory; behind multiple instances use a shared store.
- Demo auth (mock mode) uses a non-cryptographic hash and is for the demo only.
- No external security review has been done.
