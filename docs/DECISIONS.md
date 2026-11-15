# Decisions register

| ID | Question | Decision for the POC | Owner | Production-blocking? |
|---|---|---|---|---|
| D1 | Guest checkout or mandatory login? | Demo customer pre-signed-in | Business | Yes |
| D2 | Delivery model, coverage, fees, slots | Demo values (see KNOWN_ISSUES) | Business | Yes |
| D3 | Single shop vs branches | Single store; `storeId` columns kept for later | Business | No |
| D4 | COD enabled? limits? | Enabled, ₹2,000 demo limit | Business | Yes |
| D5 | Returns / cancellation / refund policy | Cancel allowed while Placed/Confirmed; refund wording deferred | Business | Yes |
| D6 | Loyalty / referral rules | Demo-labelled ledger (10 pts = ₹1) | Business | Yes |
| D7 | Notification channels | In-app preferences only; nothing delivered | Business | Yes |
| D8 | Languages at launch | English only | Business | No |
| D9 | Backend platform | Node + Express + PostgreSQL (per request) instead of Supabase in the Blueprint | Tech lead | No |
| D10 | Product photography | Demo images cropped from supplied mockups | Business | Yes |
| D11 | What amount does the sticky cart bar show? | Item subtotal (after item discounts), labelled "subtotal". Delivery, coupon and reward points are only known on the Cart screen, which stays the source of the final total. | Business | No |
| D12 | One font family for the app? | Inter everywhere (UI request of 2026-11-03). Headings no longer use Playfair; change the family in `mobile/src/theme` `fonts` and `App.tsx` only. | Business | No |
| D13 | Admin API traffic and the global rate limit | Resolved 2026-11-03: 600 requests / 15 min per IP still applies to the public app, customers and any request without a valid staff token. Signed-in staff are counted per person (3000 / 15 min each) in `backend/src/middleware/rateLimits.ts`, because the admin gateway sends all staff from one IP. Authorisation unchanged. Restart the API to apply. | Tech lead | No |
| D14 | Delivered folder layout | Open. Backend is in `backend/.env/`, app in `mobile/AGENTS/`, admin in `admin/package/`; `prisma/seed.ts` and the README assume `backend/`, `mobile/`, `admin/` roots. Confirm the intended layout before the next hand-over. | Tech lead | No |
| D15 | Mobile brand palette | Keep burgundy / warm cream / gold (user decision 2026-11-04). The red/blue/yellow/maroon palette from the UI brief is not adopted. | Business | No |
| D16 | Customer profile photo: is it uploaded to the server? | Open. No backend endpoint exists, so a confirmed photo is kept on the phone only. Needs a storage decision (where, retention, who can see it) before any upload. | Business / Tech lead | Yes |
| D17 | Expo push project ID | Open. Push tokens need an EAS project ID (`eas init`, or set `EXPO_PUBLIC_EAS_PROJECT_ID`). Until then the app says push is not set up and registers nothing. | Tech lead | Yes |
| D18 | Service vs promotional notifications | Order lifecycle messages (placed, status, cancelled, return decision, refund) are service messages: no marketing opt-in, controlled by the phone permission. Offers are promotional and need the opt-in. Confirm with legal. | Business / Legal | Yes |
| D19 | Privacy policy text | Open. The in-app Privacy & permissions panel is plain-language only. A policy URL and legal review are needed before store submission. | Business / Legal | Yes |
| D20 | Scheduled-slot delivery fee | Business to confirm. The two "Today" slots are ₹30 and Express is ₹40 (starting values). Not fixed in code: the owner sets each fee in Admin > Delivery and the app and server both use it. | Business | No |
| D21 | Brand name | Business to confirm. The logo and customer app header read "Sree Sweets"; the store name used in messages and receipts comes from Admin > Settings > Store name (default "Shree Hari Sweets & Snacks"). Pick one spelling, then set it there. | Business | No |
| D22 | Reward rules | Resolved 2026-11-06: editable in Admin > Offers & Rewards > Rewards (points per ₹100 earned, points needed for ₹1). Starting values: 1 point per ₹10, 10 points = ₹1. Referral rewards are not built and stay hidden in the live app. | Business | No |
| D23 | Seed data | Resolved 2026-11-06: the seed no longer creates the sample customer unless `SEED_DEMO_CUSTOMER=true`, and never resets stock when re-run. New sizes start at 50 in stock; set real counts in Admin > Inventory. | Tech lead | No |
