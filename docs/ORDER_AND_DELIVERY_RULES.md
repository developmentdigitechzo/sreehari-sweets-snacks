# Order, cancellation, rewards and delivery rules (current)

## Payments
- A real (provider) payment is confirmed **only** by the provider: signed webhook or verified checkout callback.
- `POST /api/orders/:id/reconcile` is a demo-only shortcut. It marks a **simulated** pending payment as paid. For a real payment it changes nothing and answers `pending`. (Before, any signed-in customer could mark their own real pending payment as paid.)

## Cancelling an order
- **Customer, instantly:** `POST /api/orders/:id/cancel`, allowed while the order is `PLACED` and nothing has been paid online (Cash on Delivery, or an online payment still unpaid). Stock, coupon use and redeemed points are returned. Anything else answers 409 and stays a **cancellation request** that the store approves (paid orders need a refund).
- **Store:** unchanged (Orders > cancel, or approving a request).
- All three use one function: `backend/env-backend/src/modules/orders/cancel.ts`.

## Reward points
- Online orders earn when the provider confirms the payment.
- **Cash on Delivery orders earn when the order is delivered** (not when placed).
- Earn and redeem rates come from the store's reward settings everywhere (two places used a fixed 0.1 before).

## Demo flag
- An order is a demo order only when its customer is the demo customer. Before, every order was stored as demo (database default `true`).
- Migration `0008_order_is_demo` changes the default and corrects existing rows. **On the production database run the same SQL** (it is not in `deploy/database.sql`):
  ```sql
  ALTER TABLE "Order" ALTER COLUMN "isDemo" SET DEFAULT false;
  UPDATE "Order" o SET "isDemo" = c."isDemo" FROM "Customer" c WHERE c."id" = o."customerId";
  ```

## Delivery date and slots
- The customer picks a **delivery date** (today, up to `maxAdvanceDays` ahead) and a slot. Express is for today only. Today's timed slots close `cutoffMinutes` before they start. All in India time. The server checks this when the order is placed (`modules/orders/slots.ts`); the app mirrors it only to grey out slots (`mobile/.../services/deliveryDates.ts`).
- Admin > Delivery edits, per slot: name, text shown to customers, start and end time (24 h), fee, on/off; and the two limits (days ahead, minutes before start). Defaults: 2 days, 60 minutes. The three slot ids are fixed.
- The booked date is stored in the order's slot snapshot and shown in the app and in the admin order panel. Orders placed before this change have no date.
- Default slot names changed from "Today" to "Afternoon" and "Evening".

## Push notifications
The code is complete: token registration, tap-to-open, and (new) an order notification that arrives while the app is open refreshes the orders at once. Nothing is sent until the server has `NOTIFY_PUSH_PROVIDER=expo` and the build is a development or release build with Firebase set up for Android (Expo Go cannot receive remote push).

## Signing up with a code (phone first)
- Customer app: Create account asks for the mobile number, sends a 6-digit code, then asks for the name (and an optional email). Nothing is created until the name is given. The number is stored as verified; there is no password, and the customer signs in with a code (or can use "Use a password instead" at the start to sign up the old way).
- It is used only when the server can send codes (`OTP_PROVIDER` is `dev` or a real SMS provider) and the app has the three calls; otherwise the password form shows, exactly as before.
- API: `POST /api/auth/otp/request` and `/verify` accept `purpose: "signup"`. A number that already has an account gets 409 ("Try logging in"). Verifying returns a 15-minute `signupToken` that is signed with a different key from sign-in tokens, so it cannot be used to sign in. `POST /api/auth/signup/complete { signupToken, name, email?, consent }` creates the account and signs the customer in.
- Also fixed: a suspended customer can no longer sign in with a code (the password login already refused them).
