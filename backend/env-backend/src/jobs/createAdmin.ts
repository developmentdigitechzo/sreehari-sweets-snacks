/**
 * Creates (or promotes) a staff account. The password is read from the environment so it never lands in shell history or git:
 *   ADMIN_EMAIL=owner@example.com ADMIN_NAME="Owner" ADMIN_PHONE=+919876500000 ADMIN_PASSWORD='...' npm run admin:create
 * Role defaults to SUPER_ADMIN (set ADMIN_ROLE=MANAGER for a manager).
 */
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../modules/auth/password.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const role = process.env.ADMIN_ROLE === 'MANAGER' ? 'MANAGER' : 'SUPER_ADMIN';
  if (!email || !name || !phone || !password) throw new Error('Set ADMIN_EMAIL, ADMIN_NAME, ADMIN_PHONE and ADMIN_PASSWORD');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  if (!/^\+\d{10,14}$/.test(phone)) throw new Error('ADMIN_PHONE must look like +919876500000');
  const passwordHash = await hashPassword(password);
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    await prisma.customer.update({ where: { id: existing.id }, data: { role, passwordHash, isBlocked: false, name } });
    console.log(`Updated ${email} as ${role}`);
  } else {
    await prisma.customer.create({ data: { email, name, phone, role, passwordHash } });
    console.log(`Created ${role} ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
