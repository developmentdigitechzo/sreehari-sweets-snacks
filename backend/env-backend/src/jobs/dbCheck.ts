/** Quick connection test: npm run db:check. Prints who it connected as; never prints the password. */
import { prisma } from '../database/prisma.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Create backend/.env from .env.example and fill it in.');
  const shown = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@');
  console.log('Using', shown);
  const r = await prisma.$queryRaw<{ u: string; d: string; tz: string }[]>`select current_user as u, current_database() as d, current_setting('TimeZone') as tz`;
  console.log(`CONNECTED as ${r[0].u} to database ${r[0].d} (time zone ${r[0].tz})`);
  if (!/^(UTC|Etc\/UTC)$/i.test(r[0].tz)) console.log(`Note: set the time zone to UTC with: ALTER DATABASE ${r[0].d} SET timezone TO 'UTC';`);
}

main()
  .catch((e) => {
    const lines = String(e instanceof Error ? e.message : e).split('\n').map((l) => l.trim()).filter(Boolean);
    console.error('FAILED:', lines.slice(-2).join(' '));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
