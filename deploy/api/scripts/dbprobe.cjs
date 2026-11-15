/**
 * Connection probe for hosts without a terminal (cPanel "Run JS Script": db:probe).
 * Tries the DATABASE_URL from .env in several ways (host names and unix sockets) and prints, for each, whether it works
 * and what the database said. Read-only: it only runs SELECTs. The password is never printed.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.log('DATABASE_URL is not set. Is the .env file in the api folder (and named exactly .env)?');
  process.exit(1);
}
const u = new URL(raw);
const user = decodeURIComponent(u.username);
const db = u.pathname.replace(/^\//, '');
console.log(`Configured: user=${user} database=${db} host=${u.hostname} port=${u.port || 5432} (password length ${decodeURIComponent(u.password).length})`);

const auth = `${u.username}:${u.password}`;
const tail = (extra) => `?schema=public${extra}`;
const variants = [
  ['as configured', raw],
  ['host localhost', `postgresql://${auth}@localhost:5432/${db}${tail('')}`],
  ['host 127.0.0.1', `postgresql://${auth}@127.0.0.1:5432/${db}${tail('')}`],
  ['host ::1 (IPv6)', `postgresql://${auth}@[::1]:5432/${db}${tail('')}`],
  ['server IP', `postgresql://${auth}@172.235.18.108:5432/${db}${tail('')}`],
  ...['/var/run/postgresql', '/run/postgresql', '/tmp', '/var/lib/pgsql'].map((p) => [`unix socket ${p}`, `postgresql://${auth}@localhost/${db}${tail('&host=' + p)}`]),
];

const clean = (e) => String(e && e.message ? e.message : e).split('\n').map((l) => l.trim()).filter(Boolean).slice(-3).join(' | ').replace(/postgresql:\/\/[^\s]+/g, '<url>');

(async () => {
  let working = null;
  for (const [name, url] of variants) {
    const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
    try {
      const r = await Promise.race([
        prisma.$queryRawUnsafe(`select current_user as u, current_database() as d, has_database_privilege(current_database(), 'CONNECT') as can_connect, has_schema_privilege('public', 'USAGE') as schema_usage, has_schema_privilege('public', 'CREATE') as schema_create`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 12 s')), 12000)),
      ]);
      console.log(`OK   ${name}: ${JSON.stringify(r[0])}`);
      working = working || name;
      try {
        const t = await prisma.$queryRawUnsafe(`select count(*)::int as tables, bool_and(has_table_privilege(quote_ident(tablename), 'SELECT,INSERT,UPDATE,DELETE')) as full_table_access, string_agg(distinct tableowner, ',') as owners from pg_tables where schemaname = 'public'`);
        console.log(`     tables in public: ${JSON.stringify(t[0])}`);
      } catch (e) {
        console.log(`     could not inspect tables: ${clean(e)}`);
      }
    } catch (e) {
      console.log(`FAIL ${name}: ${clean(e)}`);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
  // If nothing worked: can this user log in to ANY database? That separates "wrong login" from "no permission on this database".
  if (!working) {
    console.log('\n--- Can this user connect to other databases? ---');
    for (const other of ['postgres', 'template1', `${user.split('_')[0]}`, user]) {
      if (other === db) continue;
      const prisma = new PrismaClient({ datasourceUrl: `postgresql://${auth}@localhost:5432/${other}${tail('')}`, log: [] });
      try {
        const r = await Promise.race([
          prisma.$queryRawUnsafe(`select current_user as u, current_database() as d, (select string_agg(datname || '=' || has_database_privilege(datname, 'CONNECT')::text, ', ') from pg_database where not datistemplate) as databases`),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 12 s')), 12000)),
        ]);
        console.log(`OK   database "${other}": ${JSON.stringify(r[0])}`);
        working = working || `login works via database "${other}"`;
      } catch (e) {
        console.log(`FAIL database "${other}": ${clean(e)}`);
      } finally {
        await prisma.$disconnect().catch(() => undefined);
      }
    }
  }
  console.log(working ? `\nFirst working way: "${working}". Use the matching DATABASE_URL in .env.` : '\nNo way worked. See the messages above.');
})();
