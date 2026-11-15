# Environments: local development and production

No URL or IP address is written in code. Each part reads its settings from `.env` files, and the right file is used automatically.

## Mobile app (`mobile/AGENTS`)
Expo loads the matching file by itself:

| File | Used when | Holds |
|---|---|---|
| `.env` | always | `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MAP_PROVIDER` |
| `.env.development` | `npm start`, Expo Go, development builds | optional overrides only |
| `.env.production` | release builds (EAS `production`, `preview`, `apk-live`, `expo export`) | `EXPO_PUBLIC_API_URL_PRODUCTION` |

**Local development.** Nothing to set. The app asks the running dev server which computer it is on and uses `http://<that computer>:4000/api`, so it works on any Wi-Fi without editing an IP. Optional: `EXPO_PUBLIC_API_PORT`, or `EXPO_PUBLIC_API_URL_LOCAL` (use `{host}` for the computer's address, or write a fixed address).

**Production.** `EXPO_PUBLIC_API_URL_PRODUCTION` in `.env.production` (currently the temporary cPanel address; replace it when the final domain is ready). A release build never falls back to a local address: if the value is missing the app stops at start-up with a clear message, and a non-https address prints a warning. EAS builds read `.env.production` from the project (it is committed, because it holds public values only; never put secrets in `EXPO_PUBLIC_*`).

**Override.** `EXPO_PUBLIC_API_URL` forces one address in every environment (for one-off testing or CI). Leave it unset normally.

After editing any `.env` file restart with `npm run start:live` (it clears Expo's cache). Logic and tests: `src/config/apiUrl.ts`, `src/config/apiUrl.test.ts`.

## Admin panel (`admin/package`)
Next.js loads `.env.development` for `npm run dev` and `.env.production` for `npm run build` / `npm start`; real environment variables (for example those set in cPanel) override both.

| Variable | Development | Production |
|---|---|---|
| `API_URL` | `http://localhost:4000/api` | the production API, including `/api` |
| `COOKIE_SECURE` | `false` | `true` |

In production a missing `API_URL` makes the panel answer "not configured" instead of calling localhost.

## Backend (`backend/env-backend`)
Already environment-driven: each machine has its own `.env` (never committed). Local: copy `.env.example`. Production: create `.env` on the server from `deploy/env-template.txt`. The two addresses to set per environment are `PUBLIC_URL` (the API's own public address) and `CORS_ORIGINS` (the admin panel's address).

## Quick check
- Phone and PC on the same Wi-Fi, backend running on port 4000 (allow Node through the Windows firewall), then `npm run start:live` in `mobile/AGENTS`. Account → About shows the server address in use.
- A release build must show the production address in the same place.
