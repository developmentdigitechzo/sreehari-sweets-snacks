# Testing setup

Four layers. Run the first three before every change; the fourth needs a phone.

| Layer | What it checks | Command | Needs |
|---|---|---|---|
| 1. Logic tests | Pure rules: prices, validation, delivery dates, CSV rules, API-address choice | mobile: `npm test` · backend: `npm test` · admin: `npm test` | nothing |
| 2. Component tests (new) | Screens and components render and behave: login steps, category layout, banners | mobile: `npm run test:components` | nothing |
| 3. Integration tests | The real API + PostgreSQL, end to end | backend: `npm run test:integration:all` | a throwaway database (below) |
| 4. Device tests | What only a real phone shows: layout on real screens, GPS, push, keyboard, gestures | checklist below | a phone or emulator |

`npm run test:all` in `mobile/AGENTS` runs layers 1 and 2. Typecheck (`npm run typecheck`) and lint (`npm run lint`) belong with them.
Windows note: the folder name contains `&`; if `npm run` fails, call the tool through `node`, for example `node node_modules/jest/bin/jest.js --runInBand`.

## Layer 2: component tests (Jest + React Native Testing Library)
- Files: `*.test.tsx` beside the code. Config: `mobile/AGENTS/jest.config.js`, shared setup `jest.setup.ts`. Plain `*.test.ts` files stay on Node's own runner, so the two never collide.
- Testing Library 14 is asynchronous: `await render(...)`, `await fireEvent.press(...)`.
- A test decides what the server, the auth store and navigation do (see `src/screens/LoginScreen.test.tsx`); nothing real is called.
- Present (78 tests): `FeatureBanner` 4, `PhoneField` 3, `LoginScreen` 11, `CategoriesScreen` 6, `OrderCard` 8, `OrdersScreen` 8, `SlotOption` 6, `BottomSheet` 4, `OrderTrackingScreen` 9 (cancel flows and what the customer sees), `CheckoutScreen` 7 (delivery day and slot picker, room for the pinned bar), `SignupScreen` 12 (phone-first signup with a code, and the password form).
- Not yet covered: Cart, Payment, Order result, Home, Product detail. Add them with the change that touches them.
- Shared fixture: `src/testing/fixtures.ts` (`makeOrder`).
- The tests were checked to be able to fail: breaking `LoginScreen` or `FeatureBanner` on purpose made them fail.

## Layer 3: integration tests on a throwaway database
These suites create and change data. **Never point them at the development or production database.** The runner refuses any database whose name does not end in `_test`.

One-time setup (PostgreSQL running locally):
```bash
cd backend/env-backend
# 1. create + migrate the test database (Prisma creates the database if it does not exist)
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/shree_hari_test?schema=public" node node_modules/prisma/build/index.js migrate deploy
# 2. seed it
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/shree_hari_test?schema=public" npm run seed
```
Run (the runner starts and stops an API for each suite with the settings that suite needs):
```bash
TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/shree_hari_test?schema=public" npm run test:integration:all
TEST_DATABASE_URL=... npm run test:integration:all -- regression admin     # only some
```
PowerShell: `$env:TEST_DATABASE_URL="..."; npm run test:integration:all`.
Suites: `integration`, `flows` (OTP, reset, payments), `admin`, `workflows`, `sync`, `verify`, and the new `regression` (see its header: payment shortcut, COD points, demo flag, customer cancel, delivery dates, CSV import, signup with a code).
Each run adds a few test customers and orders to that database; that is expected. Delete and recreate it whenever you like.

## Layer 4: real-device testing
What a person has to provide, and why it cannot be done from the development PC:

| Need | Why |
|---|---|
| An Android phone (and an iPhone if you will ship to iOS) on the **same Wi-Fi** as the PC running the backend | The app finds the backend through the PC's Wi-Fi address. Windows Firewall must allow Node on port 4000. |
| A PC with enough free memory to run Metro (about 2 GB free) | Metro ran out of memory on the current PC, so no app has been run from here. |
| **Expo Go** for login, browsing, cart, checkout, orders | Fast. Remote push notifications do **not** work in Expo Go. |
| A **development build** (`eas build --profile development-live`, Android APK) | Needed for push notifications and any native module added later (maps, payments). |
| Your `google-services.json` (Firebase) | Android push. Placed in `mobile/AGENTS/` or set as the `GOOGLE_SERVICES_JSON` EAS secret. |
| Backend settings `NOTIFY_PUSH_PROVIDER=expo` | Without it the server never sends a push. |
| A map provider key | Only when the address map is built. |
| Razorpay test keys | Deferred: online payment is not being built yet. |

Checklist for each build (record the device model, Android/iOS version and screen size):
1. Small phone (about 360 dp wide), normal phone, large phone; portrait. Check Home, Categories, Cart, Checkout, Payment, Orders, Account: no clipped text, no overlapping bars, banners and tiles aligned.
2. Keyboard: Login, Signup, address form, coupon field: the focused field stays visible.
3. Login by code (needs `OTP_PROVIDER` set on the server) and by password; signup; logout.
4. Place a Cash on Delivery order for today and for tomorrow; cancel one straight away; open tracking.
5. Location: allow, deny once, deny permanently (then "open settings"), location services off.
6. Notifications (development build only): allow, deny; order status change shows a push and tapping it opens the order.
7. Rotate or use split-screen if the device supports it: bottom sheets still fit.
8. Watch the Metro log for red or yellow warnings while doing the above and note them.
