# Deploying to cPanel (admin at yourdomain.com/admin, API at api.yourdomain.com)

Needs a host with **Setup Node.js App** (CloudLinux + Passenger, Node 20+) and **PostgreSQL**. If PostgreSQL is not offered,
use a managed one (Neon, Supabase) and put its address in `DATABASE_URL`. The mobile app is not hosted here (EAS build → stores).

## 1. Backend (`api.yourdomain.com`)
1. Locally: `cd backend/env-backend && npm ci && npm run build` (creates `dist/`).
2. Upload `dist/`, `prisma/`, `seed-images/`, `package.json`, `package-lock.json` to e.g. `~/api`. Not `node_modules`, not `.env`.
3. cPanel → PostgreSQL Databases: create database + user, grant all privileges.
4. cPanel → Setup Node.js App: Node 20+, root `api`, URL `api.yourdomain.com`, startup file `dist/src/server.js`.
5. Environment variables (in that screen): `DATABASE_URL`, `JWT_SECRET` (long random), `NODE_ENV=production`,
   `PUBLIC_URL=https://api.yourdomain.com`, plus provider settings from `docs/EXTERNAL_INTEGRATION_SETUP.md`.
6. Run NPM Install (it prepares the database client), then use "Run JS Script" on the Node.js App page: `prisma:deploy`, then `admin:create:prod` (with ADMIN_EMAIL, ADMIN_NAME, ADMIN_PHONE, ADMIN_PASSWORD set as variables; delete the password variable afterwards). No Terminal needed. See `deploy/UPLOAD_STEPS.md`.
7. Restart. Check `https://api.yourdomain.com/api/health`. Create the first admin: `npm run admin:create`.
8. Cron (every 5 min): `npm run jobs:send-scheduled` and `npm run jobs:expire-payments` (from the app folder).

## 2. Admin panel at `yourdomain.com/admin`
1. Locally, build with the base path (PowerShell):
   `cd admin/package; $env:NEXT_PUBLIC_BASE_PATH='/admin'; npm ci; npm run build`
   (In Git Bash on Windows put `MSYS_NO_PATHCONV=1` before the command, or Git Bash rewrites `/admin` into a Windows path.)
2. Upload `.next/`, `public/` (if present), `package.json`, `package-lock.json`, `next.config.mjs`, `middleware.ts`'s build output is inside `.next/`,
   and `cpanel-server.js`. Not `node_modules`.
3. cPanel → Setup Node.js App → Create: Node 20+, **Application URL `yourdomain.com/admin`**, root `admin`, startup file `cpanel-server.js`.
4. Environment variables: `API_URL=https://api.yourdomain.com/api`, `NEXT_PUBLIC_BASE_PATH=/admin`, `COOKIE_SECURE=true`, `NODE_ENV=production`.
5. Run NPM Install, Restart, open `https://yourdomain.com/admin`.

The sign-in cookie is limited to `/admin`, so the rest of your site never sees it. The admin talks to the API from its own server
(`/admin/api/proxy`), so the API's `CORS_ORIGINS` does not need the admin address.

## 3. Mobile app
Set the app's production API address (`EXPO_PUBLIC_API_URL_PRODUCTION` in `mobile/.env.production`) to `https://api.yourdomain.com/api`, then build with EAS (see `docs/ENVIRONMENTS.md`).

## After going live
AutoSSL on both hostnames; keep `uploads/` outside the folder you replace on each deploy; back up the database.
