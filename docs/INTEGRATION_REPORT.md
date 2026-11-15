# Integration report: Admin panel + Mobile app + one backend + one PostgreSQL

Follows [`INTEGRATION_AUDIT.md`](INTEGRATION_AUDIT.md) (approved plan). Everything below was run; where something was **not** verified it says so.

## Result in one line
Both apps use the same API and database. A change made in the admin panel reaches the app, and what the customer does in the app appears in the admin panel, for the five workflows you listed. Verified by 15 end-to-end tests on real PostgreSQL plus a live browser run of the app and the admin panel together. Real phones, real payments, SMS and push were not tested.

## What changed

### Backend
| Change | Why |
|---|---|
| `GET /catalog` now also returns the store's **delivery rules** (free-delivery limit, COD limit, enabled slots with fees) and each coupon's **eligibility** (start date, categories, products) | App preview used hard-coded rules (gaps 3, 4) |
| Coupon category rules cover **subcategories** (a coupon on "Cakes" applies to cakes in "Birthday Cakes") | Found while testing: products sit in subcategories, so a parent-category coupon silently matched nothing |
| `requireActive` on every customer route: **blocked customers lose access immediately**, even with a still-valid token | Gap 6 |
| Customers get an in-app message when the store changes their order status, cancels an order, decides a return, or pays a refund; the "order placed" message is now a real (not simulated) row | Workflow 2 |
| `GET /me/rewards` (balance + history from the ledger); `GET /me` includes `marketingOptIn` | App showed a local, fake points history in live mode |
| `CHECKOUT_RATE_LIMIT_PER_MIN` (default 20, unchanged) | Needed to run order tests without tripping the limiter |
| Fixed: `GET /serviceability/:pincode` was behind the customer-only auth router | Pre-existing bug |

No database migration was needed for this round (migration 0005 from the admin work is the latest).

### Mobile app (live mode = `EXPO_PUBLIC_USE_MOCK=false`; demo mode is unchanged)
| Change | Gap |
|---|---|
| **Orders come from the server**: loaded after sign-in, on opening the Orders tab, with pull-to-refresh; the tracking screen refreshes every 15 s while open and stops when the order is delivered/cancelled | 1 |
| Status simulator, demo delivery partner and seeded demo orders are **not shown** in live mode | 1 |
| Catalogue store **starts empty** in live mode (skeleton, error with retry, empty state); demo data is only used in demo mode | 2 |
| Delivery rules and slots in the cart/checkout preview come from the catalogue; a slot the store switched off disappears; coupon eligibility and start dates are applied in the preview | 3, 4, 9 |
| Profile edits are saved to the server; the name/email/marketing choice are re-read after sign-in | 5 |
| **Return / cancellation request** sheet on the order screen (only when the server allows it), with the request status shown | 7 |
| **Messages inbox** (bell and Account row): real messages, unread marker, mark as read | 7 |
| **Marketing opt-in switch** in Account → Notifications, saved to the server, **off until the customer turns it on** | 7 |
| Rewards history read from the server; reward points refresh after an order | |
| Banner views and taps are reported (live mode only) | requested earlier |

### Admin panel
No screen changes; it already used the shared API. Its order/return/refund actions now also send the customer an in-app message (backend change above).

## Business workflows: verified
All run by `npm run test:workflows` (15 tests, real PostgreSQL, one API) using the same endpoints the app calls, plus the admin endpoints.

| Workflow | Verified |
|---|---|
| 1 Product sync | Admin creates a product → in `/catalog`; price change → catalogue price; archive → leaves the catalogue, cannot be bought, **past order keeps its name and price**. Category hidden → leaves the app. Cake flavours/message rules → reach the app. |
| 2 Order management | App order → listed in admin with customer, items, payment, address; admin moves it through the statuses → app sees the status, full history, and an inbox message; another customer cannot see or change it |
| 3 Inventory | Stock deducted once; **repeating the same checkout returns the same order**; admin stock set → app shows it; oversell refused; **5 simultaneous buyers for 3 units → exactly 3 orders, stock 0, never negative**; cancel restores stock once; stock history adds up to the stock |
| 4 Customers | Registration, profile edit and address appear in admin; **a blocked customer with an old token is refused** (orders, profile, order list) and regains access when unblocked |
| 5 Offers & pricing | Category coupon → reaches app → server discounts only eligible lines (including subcategories); switched-off coupon gives nothing; **totals sent by a client are ignored**; admin delivery fee/threshold/slot/COD limit change the next order; disabled slot refused |
| Returns | Customer request → admin approve + manual refund → customer sees "refunded" and the messages |
| Consistency | no negative stock, every order has payment and items, every variant's stock equals the sum of its movements |

## Live browser run (Expo web in live mode + admin API)
- App loaded the catalogue from the API (no demo products), reported banner views.
- An order placed with the app's checkout call appeared on the Orders tab and the tracking screen.
- Admin moved it to Confirmed → Preparing: **the open tracking screen updated by itself (≤15 s)** with the real timestamps.
- Customer sent a cancellation request from the app (reason required: validation shown); the screen showed "waiting for the store"; admin approved; the screen showed **Order Cancelled**.
- Inbox listed the real messages.
- Not driven in the browser (covered by API tests only): signup form in live mode, the checkout/payment screens, profile edit, the marketing switch, return request on a delivered order.

## Checks run (final)
| | Result |
|---|---|
| Backend typecheck, lint, build | clean |
| Backend unit tests | 47 / 47 |
| API integration / OTP-reset-payments / admin / workflows (real PostgreSQL) | 30 / 25 / 33 / 15, all pass |
| Mobile typecheck, lint, unit tests | clean; 27 / 27 |
| Mobile production bundle (`expo export`, Android, live-mode env) | built |
| Admin typecheck, lint, production build | clean; built |

Raw output: `docs/evidence/`.

## API map (final)
| Area | Admin panel | Mobile app |
|---|---|---|
| Catalogue, banners, coupons, delivery rules | `/admin/products`, `/categories`, `/cakes`, `/banners`, `/coupons`, `/delivery` | `GET /catalog` |
| Orders | `/admin/orders*`, `/admin/returns*` | `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/return-requests`, `GET /me/return-requests` |
| Customers | `/admin/customers*`, `/admin/segments*` | `/auth/*`, `GET/PATCH /me`, `/me/addresses`, `/me/cart`, `GET /me/rewards` |
| Messages | `/admin/broadcasts*` | `GET /me/notifications`, `POST /me/notifications/:id/read`, `PUT /me/marketing` |
| Inventory | `/admin/inventory*` | availability in `/catalog`, enforced in `POST /orders` |
| Payments | `/admin/payments` | `/payments/:orderId/*` |
| Analytics | `/admin/dashboard`, `/admin/reports` | `POST /banner-events` |

## Not done / not verified (honest list)
- **Real devices:** nothing ran on Android/iOS; only the web build of the app, in a desktop browser.
- **Push-token registration is NOT built in the app** (needs `expo-notifications` and a development build). The API endpoint exists. Push, SMS and WhatsApp remain blocked by credentials.
- **Online payment checkout** in the app (Razorpay SDK) is not built; COD and the test provider are what was exercised.
- **Wishlist** stays on the device (your decision).
- Order refresh is polling (15 s), not push.
- Settings (delivery rules, thresholds) are cached for up to 15 s inside each API process; with several API instances an admin change can take up to 15 s to reach every instance.
- The app's totals are a **preview**; the server's total is what is charged (this is by design and tested).
- The mobile app's cart/checkout/payment screens were not re-driven through the browser UI in live mode this round.

## Deployment configuration
- **Backend:** `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_URL` (HTTPS), `CORS_ORIGINS` (only if a browser app calls the API directly; the admin panel uses its own server-side gateway), `ENABLE_DEMO_LOGIN=false`, provider settings as in `EXTERNAL_INTEGRATION_SETUP.md`. PostgreSQL time zone **UTC**. Run `prisma migrate deploy` against a backed-up database.
- **Admin panel:** `API_URL` (server-side), `COOKIE_SECURE=true` behind HTTPS.
- **Mobile app build:** `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_URL=https://<api host>/api`.
- Remove demo data before launch: the seeded demo customer and sample orders are for demos; run the seed only on a throwaway/dev database, or review it first.
