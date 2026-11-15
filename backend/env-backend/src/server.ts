import { createApp } from './app.js';
import { env } from './config/env.js';
import { processDueBroadcasts } from './modules/admin/broadcast.routes.js';
import { prisma } from './database/prisma.js';

// Prisma's now() defaults are evaluated by PostgreSQL in the database time zone. Anything but UTC skews every report.
prisma.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`.then((r) => {
  const tz = r[0]?.TimeZone;
  if (tz && !/^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(tz)) console.warn(`[warning] Database time zone is ${tz}, not UTC. Run: ALTER DATABASE <name> SET timezone TO 'UTC'; (timestamps and reports will be wrong otherwise)`);
}).catch(() => undefined);

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Shree Hari API (POC) listening on :${env.PORT} [${env.NODE_ENV}]`);
});

// Scheduled marketing messages: check once a minute. (Also runnable on its own: npm run jobs:send-scheduled)
const timer = env.NODE_ENV === 'test' ? null : setInterval(() => void processDueBroadcasts().catch((e) => console.error('[broadcast]', e instanceof Error ? e.message : e)), 60_000);

async function shutdown() {
  if (timer) clearInterval(timer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
