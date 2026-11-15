import { prisma } from '../database/prisma.js';
import { processDueBroadcasts } from '../modules/admin/broadcast.routes.js';

async function main() {
  const n = await processDueBroadcasts();
  console.log(`Processed ${n} scheduled message(s)`);
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
