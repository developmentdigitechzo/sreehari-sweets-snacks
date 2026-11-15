# Admin panel

A web panel for the store team, built to the five approved reference screens (burgundy sidebar, warm cream canvas, white cards, gold accents).
It talks to the **same Express API and PostgreSQL database** as the customer app: a change saved here is what customers see next.

```
admin/      Next.js 15 · React 19 · TypeScript · Tailwind 3 · Recharts      (port 3000)
backend/    Express API, new /api/admin/* routes + migration 0005             (port 4000)
```

## Run it

```bash
# 1. Backend (migrations include 0005_admin_panel; the database time zone must be UTC)
cd backend
node node_modules/prisma/build/index.js migrate deploy
ADMIN_EMAIL=owner@yourshop.com ADMIN_NAME="Owner" ADMIN_PHONE=+919800000000 ADMIN_PASSWORD='<12+ chars>' npm run admin:create
npm run dev

# 2. Panel
cd ../admin
cp .env.example .env      # API_URL=http://localhost:4000/api
npm install
npm run dev               # or: npm run build && npm start
```
Open http://localhost:3000 and sign in. The password is read from the environment by the script; it is never stored in a file.
Windows note: the folder name contains `&`, so the npm scripts call `node …` directly; renaming the folder is still recommended.

## Roles and permissions (enforced by the API, not by the screen)

| | Super Admin | Manager |
|---|---|---|
| Dashboard, orders, returns decisions, inventory, products, categories, cakes | yes | yes |
| Customers (view, block, adjust points), segments | yes | yes |
| Coupons, campaigns, banners, notifications, reports, delivery, payments (view) | yes | yes |
| **Pay refunds** | yes | no |
| **Business settings, admin users, audit log** | yes | no |

Every admin request re-reads the account from the database, so blocking or demoting someone takes effect immediately. The last active super admin cannot be demoted or blocked, and nobody can demote or block themselves.

## Modules (all backed by real data)

| Module | What works |
|---|---|
| Dashboard | Totals and change vs the previous period, sales chart (revenue/orders/customers), order-status donut, top products, recent orders, alerts for low stock / pending returns / new orders, quick actions |
| Products | List with tabs, search, category filter, sort, pagination; add/edit/duplicate; sizes with SKU, MRP, price; publish/unpublish; featured flags; images (upload); archive/restore; cake options (flavours, message rules, notice) |
| Categories | Tree, order, visibility, image, safe delete (only empty), cycle protection |
| Cakes | The nine cake subcategories and every cake's sizes, flavours, message rules |
| Inventory | Stock per size, low/out alerts (threshold in Settings), adjustments (add/remove/set, reason, note), full movement history with CSV export; orders can never push stock below zero |
| Orders | Tabs, filters, search, side panel with customer, address, items with cake options, payment, history; step-by-step status updates; cancel with reason (stock, coupon and rewards returned); CSV export |
| Returns & Refunds | Customer requests (API), approve/reject with note, optional restock, refund by recording a manual refund or through the payment gateway (when connected); partial refunds |
| Customers | List, search, status, segment filter, profile, addresses, orders, block/unblock with reason, manual reward points, CSV |
| Segments | Six built-in dynamic segments plus your own rules (spend, orders, recency, coupons, joined); real counts and insights |
| Offers | Coupons (percent / flat / free delivery), dates, limits, **category eligibility enforced at checkout**, campaigns with real revenue/orders from the linked coupon, rewards overview |
| Banners | App banners, offer popups, promotional sections: schedule, order, target, duplicate, delete, live preview, **real views/clicks** from the customer app |
| Notifications | Create (in-app, push, SMS, WhatsApp), audience (all / segment) with reach preview, schedule, drafts, templates, history with delivery results |
| Payments | History and filters, totals, provider connection status |
| Delivery | Free-delivery threshold, COD limit, per-slot fee and on/off, serviceable PIN codes |
| Reports | Sales (daily/weekly/monthly), products, categories, customers, inventory, payments; CSV |
| Settings | Business details, low-stock threshold, return window, admin users, audit log (CSV) |

## How admin changes reach the customer app
The app reads `/api/catalog` straight from PostgreSQL: published products, categories (with uploaded images), banners scheduled for now (`home_slider` placement), coupons. Orders are priced on the server from the live database, so new prices, coupon rules, delivery fees, COD limit and slot availability apply to the next order immediately. A demo-mode app (no backend) is unaffected.
Known gap: the app shows a *preview* of totals using bundled defaults before checkout; the server total at order time is the one charged.

## Messaging channels — what is real
| Channel | Status |
|---|---|
| In-app | **Works now.** Rows are written for each customer and shown in the app's Messages inbox. Order status changes, cancellations, return decisions and refunds also send one automatically. |
| Push (Expo Push service) | Code and tests done. **Not connected**: needs `NOTIFY_PUSH_PROVIDER=expo`, push credentials for your app build, and the app registering device tokens (`POST /api/me/devices`; the registration call is not in the app yet). |
| SMS (Twilio) | Code and tests done against a fake HTTP layer. **Blocked by credentials**; India also needs DLT registration for promotional SMS. |
| WhatsApp (Twilio) | Code and tests done against a fake HTTP layer. **Blocked by credentials**; business-started chats need a WhatsApp-approved template. |

When a channel is not connected the panel says so, refuses to send, and records nothing as sent. Marketing channels (push, SMS, WhatsApp) only reach customers with `marketingOptIn = true`; new customers default to **not opted in** and customers turn it on themselves in the app (Account → Notifications; stored via `PUT /api/me/marketing`). Until customers opt in, SMS/WhatsApp/push audiences are empty. This is deliberate: it avoids messaging people who never agreed.
Setup variables: `NOTIFY_PUSH_PROVIDER`, `NOTIFY_SMS_PROVIDER`, `NOTIFY_WHATSAPP_PROVIDER`, `TWILIO_*`, `TWILIO_WHATSAPP_FROM` (see `backend/.env.example`). Scheduled messages are sent by the API's timer every minute, or `npm run jobs:send-scheduled`.

## Security
- Staff sign in at `/api/admin/auth/login` (separate from customers, 8 attempts / 15 min per IP by default, one generic error for every failure reason).
- The panel keeps the API token in an **httpOnly, SameSite=Strict** cookie and calls the API through a same-origin gateway; page scripts never see it. Set `COOKIE_SECURE=true` behind HTTPS.
- Per-route permission checks with a live database lookup; zod validation on every input; CSV exports neutralise spreadsheet formulas; uploaded images are type-checked from their bytes (≤5 MB) and only uploaded or https image URLs are accepted.
- `AuditLog` (who, what, when, IP) and `StockMovement` are **append-only at the database level** (triggers). Audit entries never contain passwords or provider keys.
- No provider secret is ever sent to the browser; `/admin/integrations` returns provider names and booleans only.

## Database changes (migration 0005, additive)
New tables: `StockMovement`, `AuditLog`, `BannerEvent`, `Campaign`, `Segment`, `Broadcast`, `BroadcastDelivery`, `MessageTemplate`, `DeviceToken`, `ReturnRequest`, `Setting`. New columns: `Customer.isBlocked/blockedAt/marketingOptIn`, `Banner.placement/imageUrl/createdAt/updatedAt`, `Category.imageUrl`, `Coupon.startsAt/categoryIds/productIds`, `Notification.broadcastId/readAt`. Role `ADMIN` is **renamed** to `SUPER_ADMIN` (no rows rewritten) and `MANAGER` added. Tested on a fresh database and as an upgrade over data (`docs/evidence/db-upgrade-0005.txt`). PostgreSQL must run with `timezone = UTC`; the API warns at start-up otherwise.

## Limitations
- Product sizes (variants) cannot be deleted once saved (past orders reference them); set stock to 0 instead.
- Slot times and wording are fixed in code; only slot fee and availability are editable.
- Reward earn/redeem rates are fixed in code (shown read-only).
- Segments are evaluated in memory; fine for one shop, move to SQL if the customer base grows large.
- The customer app now has return/cancellation requests, a messages inbox and a marketing opt-in switch (see INTEGRATION_REPORT.md). **Push-token registration is still not built.**
- Responsive checks were done in a desktop browser with emulated sizes (see TESTING_REPORT.md for exactly which pages and widths); nothing was run on real phones or tablets.
