# External integration setup

Every integration below is implemented behind a provider interface and is **off by default**. With nothing configured the
backend answers honestly (`501`/`503` with a clear code) and the app hides or explains the feature. No credential is stored
in the repository; set values in `backend/.env` (never committed). Variable names and rules: `backend/.env.example`.
The server validates them at startup and prints only the *names* of missing or invalid values.

`GET /api/capabilities` reports what is actually enabled, and the app reads it, so the UI never advertises a feature the
server cannot perform:

```json
{ "otp": "none|development|sms", "passwordReset": false, "payments": "none|test|razorpay", "reverseGeocoding": false }
```

| Integration | Status in this delivery | Needs from you |
|---|---|---|
| Reverse geocoding (Google) | Code + tests done. **BLOCKED BY CREDENTIALS** for a live check | Google Maps Platform API key |
| Map preview / draggable pin | **PARTIALLY DONE**: provider seam only, no map renders | Map key + development build (see below) |
| OTP SMS (Twilio) | Code + tests done (fake HTTP). **BLOCKED BY CREDENTIALS** | Twilio account, sender, India DLT registration |
| Password-reset email (Resend) | Code + tests done (fake HTTP). **BLOCKED BY CREDENTIALS** | Resend key + verified sending domain |
| Online payments (Razorpay) | Server flow done and tested with a test double. **BLOCKED BY CREDENTIALS**; in-app checkout **NOT DONE** | Razorpay test keys; checkout SDK in a development build |

## 1. Reverse geocoding (GPS → address) — Google Geocoding API

Why Google: best Indian address and pincode coverage, one key, and the same vendor can later supply the map. The key stays
on the server; the phone sends only coordinates to our API (`GET /api/geocode/reverse?lat=&lng=`, sign-in required).

1. Google Cloud console → create a project → enable **Geocoding API** → create an API key.
2. Restrict the key: *API restriction* = Geocoding API only; *Application restriction* = the server's IP address.
3. Set in `backend/.env`:
   ```
   GEOCODER_PROVIDER=google
   GOOGLE_MAPS_API_KEY=<your key>
   ```
4. Restart the API. Verify: `GET /api/capabilities` shows `"reverseGeocoding": true`; then
   `GET /api/geocode/reverse?lat=13.0827&lng=80.2707` with a user token returns structured address fields.

Behaviour: `ZERO_RESULTS` → 404 `GEOCODE_NO_RESULT`; `REQUEST_DENIED`/quota/network → 502 `GEOCODER_UNAVAILABLE`;
not configured → 501 `GEOCODER_NOT_CONFIGURED`. It never returns a made-up address. In the app, a failed lookup leaves the
address fields empty for manual entry, and coordinates are saved only after the user confirms the form.

## 2. Map preview and draggable pin — not implemented, here is the path

`mobile/src/services/maps.ts` defines the provider seam and `LocationMapPreview` renders whatever provider is registered; with
`EXPO_PUBLIC_MAP_PROVIDER=none` (default) it shows coordinates and the manual-entry path, nothing pretends to be a map.
Chosen provider when you proceed: **Google Maps via `react-native-maps`** (same vendor as geocoding).

Steps (cannot run in Expo Go; needs a development build, see `MOBILE_DEVICE_SETUP.md`):
1. Enable *Maps SDK for Android* and *Maps SDK for iOS*; create **separate** restricted keys per platform (package name / bundle id).
2. `npx expo install react-native-maps`; add the keys to `app.json` (`android.config.googleMaps.apiKey`, `ios.config.googleMapsApiKey`) via EAS secrets rather than committing them.
3. Add `GoogleMapProvider.native.tsx` (marker, draggable pin that calls reverse geocoding on drag end) plus a web stub, register it in `services/maps.ts`, set `EXPO_PUBLIC_MAP_PROVIDER=google`.
4. Verify on a device: pin appears at the detected point, dragging updates the address, Confirm saves coordinates, denying location still allows manual entry.

## 3. OTP login / phone verification — Twilio

`OTP_PROVIDER` = `none` (503), `dev` (code returned to the caller; **refused when NODE_ENV=production**), `twilio`.
Codes are 6 digits from a CSPRNG, stored only as an HMAC hash bound to the phone number, single use, 5-minute expiry, resend
cooldown, hourly cap and attempt limit (all configurable). Login-purpose requests give identical responses for known and
unknown numbers. In `dev` mode the app labels the screen "development mode" and shows the code; a real SMS provider never
returns the code. The app never says "OTP sent" unless the server accepted the send.

1. Create a Twilio account; buy or verify a sender number. For India, carriers require **DLT registration** of the sender ID and message template; without it delivery fails regardless of this code (an Indian gateway adapter can be added next to `otp.senders.ts` using the same interface).
2. Set `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
3. Verify: `POST /api/auth/otp/request {"phone":"+91…","purpose":"login"}` for a registered number → SMS arrives → `POST /api/auth/otp/verify` returns a session.

## 4. Password reset email — Resend

`EMAIL_PROVIDER` = `none` (the forgot-password endpoint answers 503 `EMAIL_NOT_CONFIGURED`, so the app says reset is unavailable instead of claiming an email was sent), `dev` (in-memory outbox; refused in production), `resend`.
Tokens: 32 random bytes, only the SHA-256 hash is stored, 30-minute expiry, single use, all older tokens for the account are
invalidated on use, per-account throttle, identical response for known and unknown emails. Limitation: JWT sessions that
are already signed in are **not** revoked when the password changes (they expire on their normal schedule).

1. Create a Resend account, verify your sending domain (SPF/DKIM), create an API key.
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM="Shree Hari <no-reply@your-domain>"`, and `APP_RESET_URL_BASE` (default `shreehari://reset-password`; use an https page that forwards to the app if email clients strip custom schemes).
3. Verify: submit Forgot password → email arrives → link opens the app's Reset Password screen → new password works, the old one does not, the link cannot be reused.

## 5. Online payments — Razorpay (UPI, cards, netbanking, wallets in India)

Server-side flow (`/api/payments/*`, `/api/webhooks/payments`):
1. Checkout with an online method creates the order from **server-recalculated** totals (client totals are ignored), reserves stock, creates a Razorpay order for that amount and returns `requires_payment`.
2. After the customer pays in Razorpay Checkout, `POST /payments/verify` checks HMAC-SHA256(secret, `order_id|payment_id`) for that customer's order. The signed webhook (`payment.captured`, `payment.failed`, `refund.processed`) is the second, authoritative path; the raw body signature is verified, events are deduplicated by event id, and an amount mismatch is **not** trusted.
3. Statuses: PENDING → PROCESSING → PAID / FAILED / CANCELLED → REFUNDED. Unpaid orders expire (`PAYMENT_PENDING_TTL_MINUTES`; run `npm run jobs:expire-payments` on a schedule) and release stock. Pay-on-delivery is unaffected.

To test in the Razorpay **sandbox** (no real money; do not use live keys without explicit authorization):
1. Razorpay dashboard → Test mode → Settings → API keys → generate `rzp_test_…` key and secret.
2. Dashboard → Webhooks → add `https://<public API host>/api/webhooks/payments`, events `payment.captured`, `payment.failed`, `refund.processed`, and choose a webhook secret. (Use a tunnel such as ngrok for a local API.)
3. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
4. Verify: `/api/capabilities` → `"payments":"razorpay"`; place an online order → pay with Razorpay's published test UPI/card details → webhook arrives → order shows Paid.

**What is missing for a customer to actually pay in the app:** the Razorpay Checkout SDK (`react-native-razorpay`) is a native
module that does not run in Expo Go and has not been added. Until it is, the app shows "Complete your payment" with an honest
explanation plus *Check payment status* and *Cancel payment*; it never shows a success it has not received from the server.

## What the automated tests do and do not prove

- Unit tests (`npm test`) use fake `fetch`/doubles and make **no** network, SMS, email or payment calls.
- Integration suites run the real API against real PostgreSQL with the `dev`/`test` providers, which execute the same signature, expiry and idempotency logic as production.
- Nothing here proves that Google, Twilio, Resend or Razorpay accepts our requests; that requires the credentials above and the verification step under each heading.

## 6. Email verification (shares the email provider in section 4)

`POST /api/auth/email/send-verification` (signed in) emails a single-use link for the customer's **current** email; `POST /api/auth/email/verify {token}`
(public) completes it. Tokens: 32 random bytes, SHA-256 hash stored, 24 h expiry (`VERIFY_TOKEN_TTL_MINUTES`), single use, bound to the address the
link was sent to (changing the email clears `emailVerifiedAt` and invalidates old links), max 3 sends per account per hour. Signup sends the email
automatically when a provider is configured; if not, the account is still created and the customer can request it from Account → *Verify email*.
`GET /api/capabilities` reports `emailVerification`. The app link is `APP_VERIFY_URL_BASE` (default `shreehari://verify-email`).

Apply on an existing database: `npm run prisma:generate` and `npm run prisma:deploy` (migration `0006_email_verification`: one nullable column + one table).
Test locally with `EMAIL_PROVIDER=dev` (links are readable at `GET /api/dev/outbox`); for real delivery use Resend as in section 4.
Integration test: start the API with `EMAIL_PROVIDER=dev AUTH_RATE_LIMIT_PER_MIN=500 PORT=4014`, then `API_URL=http://localhost:4014/api npm run test:verify`.

## 7. Push, SMS, WhatsApp and in-app messages (already implemented; switched on by credentials)

| Channel | Switch (backend `.env`) | Needs |
|---|---|---|
| In-app inbox | always on | nothing: rows in the database, shown in the app's Inbox |
| Push (Expo) | `NOTIFY_PUSH_PROVIDER=expo` | a development/production build with an EAS project id; the user must allow notifications |
| SMS (Twilio) | `NOTIFY_SMS_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | India DLT registration for promotional SMS |
| WhatsApp (Twilio) | `NOTIFY_WHATSAPP_PROVIDER=twilio` + `TWILIO_WHATSAPP_FROM` | approved WhatsApp sender/templates |

Marketing messages only go to customers who opted in. Admin → Notifications reports a channel as "not connected" rather than "sent" until its switch is on.

## 8. Android push with Firebase (FCM) — step by step

The app uses **Expo push**: the phone gets an Expo push token, the backend sends to Expo's push service, and Expo delivers through
Firebase Cloud Messaging (FCM) on Android. So the Firebase side is credentials, not code in the app (`@react-native-firebase/messaging`
from React Native CLI tutorials is a different route and is not needed here).

1. **Firebase project.** console.firebase.google.com → create a project → *Add app* → Android, package name `com.shreehari.sweets.poc`
   (same as `app.json`) → download `google-services.json`.
2. **Give the file to the build.** Put it in `mobile/AGENTS/google-services.json`, or for cloud builds create an EAS *file* secret named
   `GOOGLE_SERVICES_JSON`. `app.config.js` wires it in only when it exists, so builds still work without it.
3. **FCM V1 key for Expo.** Firebase → Project settings → *Service accounts* → *Generate new private key*. Upload it to EAS:
   `npx eas-cli credentials` → Android → *Google Service Account* → *Manage your Google Service Account Key for Push Notifications (FCM V1)*.
   Never commit this file.
4. **Build a live development client.** Mock builds never register a device. Use the `development-live` profile and give the build the API address:
   `npx eas-cli env:create --name EXPO_PUBLIC_API_URL --value http://<your-PC-LAN-IP>:4000/api --environment development --visibility plaintext`
   then `npx eas-cli build --profile development-live --platform android`. Install the APK on the phone (Expo Go cannot receive remote push on Android).
5. **Backend.** In `backend/.env` set `NOTIFY_PUSH_PROVIDER=expo` and restart the API. `GET /api/capabilities` is unchanged; Admin → Notifications then shows Push as connected.
6. **Test.** Sign in on the phone → Account → Notifications → allow. The app registers its token (`POST /api/me/devices`). Then place an order and
   change its status in the admin (order pushes), or send a broadcast. For a quick token check use expo.dev/notifications with the phone's token.

What the backend now does for delivery: requests `priority: high` (heads-up delivery while the phone is idle), uses the `orders` / `offers`
channel, and deletes device tokens that Expo reports as `DeviceNotRegistered` (uninstalled apps).
