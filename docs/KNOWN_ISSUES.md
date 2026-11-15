# Known issues and limitations (current)

Feature-by-feature status: [`PRODUCTION_READINESS_REPORT.md`](PRODUCTION_READINESS_REPORT.md). Setup for blocked items:
[`EXTERNAL_INTEGRATION_SETUP.md`](EXTERNAL_INTEGRATION_SETUP.md), [`MOBILE_DEVICE_SETUP.md`](MOBILE_DEVICE_SETUP.md).

## Blocked by hardware
- **Android and iOS devices**: never run natively (no SDK/emulator/Mac/phone). Browser checks and bundle compilation only.
- **Real GPS**: logic for every state is unit-tested; on a device only a browser denied path and a stubbed grant were exercised. "Permission blocked", "services off", timeout accuracy and the native geocoder are untested.

## Blocked by credentials (code done, never called the real service)
- **Reverse geocoding** (Google), **OTP SMS** (Twilio; India needs DLT), **password-reset email** (Resend), **Razorpay sandbox**. Each answers honestly (`501`/`503`) until configured; the app hides or explains the feature.

## Admin panel (see ADMIN_PANEL.md)
- **Push, SMS and WhatsApp sending: BLOCKED BY CREDENTIALS** (code and tests done; in-app messages work). Marketing audiences are empty until the customer app has an opt-in switch and push-token registration, which are not built.
- **Customer app (live mode):** return/cancellation requests, the messages inbox and the marketing opt-in switch are built (see INTEGRATION_REPORT.md). **Push-token registration is not built** (needs expo-notifications and a development build), so push cannot reach anyone yet.
- Order status in the app refreshes every 15 s while the order screen is open, and on opening the Orders tab; it is not pushed.
- Delivery-rule changes in admin can take up to 15 s to reach every API instance (settings cache).
- The wishlist is stored on the device only.
- Banner views/clicks are real but start at zero: only the updated app reports them, and only in live (non-demo) mode.
- Product sizes cannot be deleted after saving; slot times and reward rates are code constants.
- The panel was checked in a desktop browser only (320/375/768/1024/1440); not on real phones or tablets.
- Database time zone must be UTC (the API warns at start-up).

## Sync (see SYNC_REPORT.md)
- The change feed is in memory: with more than one API process, apps fall back to refresh-on-foreground / pull-to-refresh.
- Existing products saved in a parent category (for example Rasagula) work, but should be moved to a subcategory in admin. The admin panel now refuses new ones.
- Phone networking (same Wi-Fi, Windows Firewall for port 4000, `192.168.1.3` in `mobile/.env`) was not tested on a physical phone.

## Not done
- **In-app online payment checkout** (needs `react-native-razorpay` in a development build). Online orders end at a "Complete your payment" screen; Cash on Delivery works.
- **Map preview / draggable pin**: only the provider seam exists; no map renders.
- **Component tests**, on-device/E2E automation, screen-reader accessibility audit, load testing.
- Tablet-specific layout (768 px shows the phone layout stretched, without clipping).
- Real delivery tracking, store packaging, privacy policy. (The admin panel now exists; see its section above.)

## Behaviour to know
- A cart line is identified by size + flavour + message. Same size with different customisation = separate lines; identical = one line with a higher quantity. Stock is shared across a size's lines.
- Cart badge and "Items" count **total units**.
- Demo auth accounts live on the device only (non-cryptographic hash, labelled). Real accounts use the backend.
- With `OTP_PROVIDER=dev` the code is shown on screen and the screen says so; with `none` the code-login option is hidden.
- A password reset does not sign out sessions that are already open (no revocation list).
- The demo customer has seeded orders/addresses/points; new accounts start empty. "Account → About → Reset demo data" restores the demo customer.
- Cakes: flavours, message rules, lead-time notice are demo values. **No delivery date/time selection** (not enabled; UI states it).
- Weather is informational and independent of delivery; offline it shows the last cached reading marked "offline" or an unavailable message.
- Cake photos: 5 AI-generated, low-resolution images shared by 9 cakes (`IMAGE_ASSET_INVENTORY.md`).
- Web-only console message: SVG `transform-origin` (react-native-svg) — harmless.
- Migration 0004 was applied to fresh databases in tests; the 0001+0002 → 0003 upgrade-with-data path was tested, 0004 on a database holding data was not.
- ESLint: two React-Compiler advisory rules (`react-hooks/immutability`, `react-hooks/set-state-in-effect`) are turned off individually in `mobile/eslint.config.js`; everything else passes with zero warnings.

## Environment gotchas
- Folder name contains `&`: use the npm scripts (they call `node …`) or rename the folder (recommended before native builds).
- Databases must be **UTF8** (the catalogue contains "₹").
- Expo Go only includes bundled native modules; a map or payment SDK needs a development build.
- Backend TypeScript is pinned to 6.0.x because `typescript-eslint` does not yet support 7.

## Screenshot vs BRD decisions (unchanged)
Cart totals are computed (₹706 demo cart, not the screenshot's ₹652); ratings are tagged DEMO; no fake urgency, live map or ETA; food claims only where supplied; quick-add asks for a pack size when there are several.

## Demo configuration that is NOT approved policy
Delivery fee, slots, free-delivery threshold, COD limit, serviceable pincodes, coupons, rewards and referral values (`mobile/src/data/config.ts`, `backend/src/modules/pricing`).
