# Upload steps — no terminal needed (cPanel account: sreeharisweets)

Files here: `api.tar.gz` (backend), `admin.tar.gz` (admin panel), `database.sql` (creates the tables), `env-template.txt` (settings for the backend).
You do the logins yourself. Temporary address: `https://nice-amethyst-canary.172-235-18-108.cpanel.site`

cPanel must show **Setup Node.js App** and **PostgreSQL Databases** (and ideally **Cron Jobs**). Tell me if one is missing.

## 1. Database (PostgreSQL Databases)
Database `sreeharisweets_shop`, user `sreeharisweets_userdb`. Make sure the user is **added to the database with ALL privileges**.

## 2. Backend
1. File Manager → home folder → New Folder `api` → open it → Upload `api.tar.gz` → Extract. You should see `dist`, `prisma`, `seed-images`, `package.json`.
2. In `api`, create a file `.env` with the contents of `env-template.txt` (fill the CHANGE-ME values; `@` in the DB password is `%40`).
3. Setup Node.js App → Create Application:
   Node 20 or newer · Production · Application root `api` · Application URL = your API address ·
   **Startup file `dist/src/server.js`**  (note the `src`).
4. Click **Run NPM Install**. (The server cannot generate the database client itself, so step 4b supplies it ready-made.)
   4b. File Manager → show hidden files → go to `/home/sreeharisweets/nodevenv/api/20/lib/node_modules/.prisma/client` →
   Upload `client.tar.gz` there → Extract (overwrite when asked). The folder now contains two `libquery_engine-debian-openssl-…so.node` files (your host reported Debian with OpenSSL 1.1).
   Also re-upload `api.tar.gz` over `api` (overwrite) so `package.json` is the new one (no `postinstall` step).
5. Create the tables WITHOUT Prisma's command tool (it can crash on shared hosting): cPanel → PostgreSQL Databases → scroll to
   **phpPgAdmin** (or the Databases section) → open it, log in with the database user, choose database `sreeharisweets_shop` → **SQL** tab →
   **Choose File** `database.sql` (or paste its contents) → Execute. Do this once; it must be an empty database.
   If your cPanel has no phpPgAdmin, tell me and I will give you another way.
6. Create your admin: add the four `ADMIN_*` variables (`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD`), then in **Run JS Script** run `admin:create`.
   It should print "Created SUPER_ADMIN <your email>". Then **delete `ADMIN_PASSWORD`**.
7. Click **Restart**, then open `<API address>/api/health` — it should show `"ok":true`.

## 3. Admin panel at /admin
1. File Manager → New Folder `admin` → Upload `admin.tar.gz` → Extract (a `.next` folder must appear inside `admin`).
2. Setup Node.js App → Create Application: Node 20+ · Production · Application root `admin` ·
   Application URL `<your domain>/admin` · Startup file `cpanel-server.js`.
3. Environment variables:
   `API_URL` = `<API address>/api` · `NEXT_PUBLIC_BASE_PATH` = `/admin` · `COOKIE_SECURE` = `true` · `NODE_ENV` = `production`
4. Run NPM Install → Restart → open `<your domain>/admin` and sign in with the admin from backend step 6.

## 4. Scheduled jobs (cPanel → Cron Jobs, every 5 minutes)
Two jobs. Use the node path shown at the top of the Node.js App page (it looks like
`/home/sreeharisweets/nodevenv/api/20/bin/node`):
- `cd /home/sreeharisweets/api && /home/sreeharisweets/nodevenv/api/20/bin/node dist/src/jobs/sendScheduled.js`
- `cd /home/sreeharisweets/api && /home/sreeharisweets/nodevenv/api/20/bin/node dist/src/jobs/expirePayments.js`
(They read the `.env` file you made in step 2.2.)

## 5. After it works
- Change the cPanel and database passwords (both were pasted in chat); if you change the database password, update `DATABASE_URL` in `.env`.
- Turn on AutoSSL for the domain.
- Mobile app: set `EXPO_PUBLIC_API_URL` to `<API address>/api`, then build with EAS.
