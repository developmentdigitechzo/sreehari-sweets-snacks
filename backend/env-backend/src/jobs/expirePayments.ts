import { prisma } from '../database/prisma.js';
import { expireStalePayments } from '../modules/payments/payments.service.js';

// Run every few minutes (cron, Windows Task Scheduler, or the host's scheduler).
async function main() {
  const n = await expireStalePayments();
  console.log(`Expired ${n} unpaid online order(s) and released their stock.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
