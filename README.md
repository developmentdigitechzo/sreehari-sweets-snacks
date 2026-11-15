# Shree Hari Sweets & Snacks — Customer App

React Native (Expo) customer app + Node/Express/PostgreSQL backend.
**Status: verified POC, not ready for public launch.** Real SMS, email, maps, online-payment checkout and native-device testing
are blocked on credentials or hardware (code and server logic are done and tested). Start with
[`docs/PRODUCTION_READINESS_REPORT.md`](docs/PRODUCTION_READINESS_REPORT.md).

```
mobile/    Expo + TypeScript app
admin/     Next.js admin panel for the store team (see docs/ADMIN_PANEL.md)
backend/   Express + TypeScript + Prisma + PostgreSQL (5 migrations, seed, 116 integration tests, 53 unit tests)
docs/      readiness, integration setup, device setup, testing, database, implementation reports · evidence/ (raw test output)
```

## What's in the app
Home (weather chip, banners, shelves, recently viewed) · Categories incl. **Cakes** (flavour + message options) · Search/filters · Product details · Cart (customised lines kept separate) · Login / Signup / **code login (when SMS or dev OTP is on)** / Forgot + Reset password · Checkout with saved addresses and **GPS on request** · Cash on Delivery · Order tracking · Offers & rewards · Account.
Guests can browse and build a cart; checkout needs an account, and the guest cart is merged on login.

## Run the mobile app
```bash
cd mobile
npm install
npm start            # w = web preview · scan the QR with Expo Go on a phone
npm run typecheck && npm run lint && npm test
```
Default mode uses a built-in **mock API** and **demo accounts stored on the device** (clearly labelled; no OTP/SMS is sent). *Windows:* the `&` in this folder's name breaks `npx`; the scripts call `node` directly — or rename the folder. Phone setup: [`docs/MOBILE_DEVICE_SETUP.md`](docs/MOBILE_DEVICE_SETUP.md). Mobile env: `mobile/.env.example`.

## Run the backend (PostgreSQL 14+, UTF8 database)
```bash
cd backend
cp .env.example .env                # set DATABASE_URL and JWT_SECRET; everything else is optional
npm install
node node_modules/prisma/build/index.js migrate deploy
npm run seed && npm run dev         # http://localhost:4000/api/health
npm run typecheck && npm run lint && npm run build && npm test
```
Integration suites (use a **throwaway** database; start the API first, see the header of each test file for the provider settings):
`npm run test:integration` (API), `npm run test:flows` (OTP, password reset, payments), `npm run test:admin` and `npm run test:workflows` (admin + app end to end).
The app picks its API address by environment, with no IP written in code: while developing it uses the computer running `npm start` (port 4000); release builds use the production address from `mobile/.env.production`. Start with `npm run start:live` after changing a `.env` file. Details: [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md). **Without them the app runs in demo mode and shows no store data** (a "Demo data" ribbon says so on Home).

## Admin panel
`cd admin && cp .env.example .env && npm install && npm run dev` (needs the backend running and a staff account: `npm run admin:create` in backend). Full guide, roles and what is real vs blocked: [`docs/ADMIN_PANEL.md`](docs/ADMIN_PANEL.md).

## Optional integrations (all off by default; `GET /api/capabilities` tells the app what is on)
Google reverse geocoding · Twilio OTP · Resend email · Razorpay payments → [`docs/EXTERNAL_INTEGRATION_SETUP.md`](docs/EXTERNAL_INTEGRATION_SETUP.md). No secrets live in the repo; never commit `.env`.

## Real vs simulated
| Area | Status |
|---|---|
| Backend, PostgreSQL, migrations, auth (scrypt), addresses, cart, orders | **Real**, tested on PostgreSQL 18 |
| OTP, password reset, payment verification/webhooks (server) | **Real logic**, tested with development/test providers; real SMS/email/Razorpay **not connected** |
| Weather | **Real** (Open-Meteo), cached, honest failure state |
| GPS address | Device location on demand; reverse geocoding needs a Google key; **no map renders yet** |
| Online payment in the app | **Not available** (needs checkout SDK in a development build); demo simulator is labelled SIMULATED and hidden when real payments are on |
| Delivery partner, status changes, notifications | **Simulated** |
| Product photography | Demo images (cake photos are low-res AI previews) |
| Android / iOS device testing | **Not done** (checklist in `docs/MOBILE_DEVICE_SETUP.md`) |

More: [Sync report](docs/SYNC_REPORT.md) · [pgAdmin queries](docs/sql/verify-sync.sql) · [Integration report](docs/INTEGRATION_REPORT.md) · [Admin panel](docs/ADMIN_PANEL.md) · [Known issues](docs/KNOWN_ISSUES.md) · [Testing report](docs/TESTING_REPORT.md) · [Implementation](docs/IMPLEMENTATION_REPORT.md) · [Screen map](docs/SCREEN_MAP.md) · [Decisions](docs/DECISIONS.md) · [Image inventory](docs/IMAGE_ASSET_INVENTORY.md)
