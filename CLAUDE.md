# Shree Hari — Engineering Rules

## Source of truth
Business rules: `Shree_Hari_Business_Logic_Requirements_v1.pdf`. Engineering rules: `Shree_Hari_Claude_Engineering_Blueprint.pdf`.
Visual reference: the 10 approved screens (approved palette: ivory #FFF9EF, red #C8102E, blue #123B7A, yellow #FFC928; tokens in `mobile/AGENTS/src/theme`). Do not invent business rules — record unknowns in `docs/DECISIONS.md`.

## Commands (Windows path contains `&`: call CLIs via `node`)
- Mobile: `cd mobile && node node_modules/typescript/bin/tsc --noEmit` · `npm start`
- Backend: `cd backend && node node_modules/typescript/bin/tsc --noEmit` · `npm test` · `npm run dev`

## Architecture
- UI never talks to the DB. Screens use `ShopApi` (`mobile/src/services/api.ts`); mock and live implementations must stay interchangeable.
- Prices, stock, coupons, totals are calculated server-side (`backend/src/modules/pricing`). The mobile copy (`services/pricing.ts`) is a preview.
- Design tokens only from `mobile/src/theme`. Reusable pieces in `mobile/src/components`; animation helpers in `mobile/src/animations`.

## Security and money
Default-deny. Check auth and ownership server-side. Money is NUMERIC, never float. Orders are idempotent and snapshot items.
Never store raw card data. Never put secrets in the mobile app. Label anything simulated as simulated.

## UI quality
Every screen has loading, empty, error and success states. No dead buttons or fake live data. Respect reduced motion.
Run typecheck before declaring work done and report real command results.
