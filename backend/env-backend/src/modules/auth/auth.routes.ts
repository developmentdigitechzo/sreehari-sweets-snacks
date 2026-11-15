import { Router } from 'express';
import { normalizeIndianPhone } from './validators.js';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { requireAuth, signToken } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { loginSchema, signupSchema } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import { sendVerificationEmail } from './verify.routes.js';

export const authRouter = Router();

/** Brute-force protection on credential endpoints. */
const credentialLimiter = rateLimit({ windowMs: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false });

const publicCustomer = (c: { id: string; name: string; phone: string; email: string | null; isDemo: boolean; emailVerifiedAt?: Date | null }) => ({
  id: c.id, name: c.name, phone: c.phone, email: c.email ?? undefined, isDemo: c.isDemo || undefined,
  emailVerified: c.email ? !!c.emailVerifiedAt : undefined,
});

authRouter.post('/auth/signup', credentialLimiter, async (req, res) => {
  const input = signupSchema.parse(req.body);
  const [byPhone, byEmail] = await Promise.all([
    prisma.customer.findUnique({ where: { phone: input.phone } }),
    input.email ? prisma.customer.findUnique({ where: { email: input.email.toLowerCase() } }) : null,
  ]);
  if (byPhone) throw new AppError(409, 'An account with this mobile number already exists. Try logging in.', 'CONFLICT', 'phone');
  if (byEmail) throw new AppError(409, 'An account with this email already exists.', 'CONFLICT', 'email');
  const customer = await prisma.customer.create({
    data: { name: input.name, phone: input.phone, email: input.email?.toLowerCase(), passwordHash: await hashPassword(input.password) },
  });
  // The account is created either way. The verification email is best effort: if no provider is configured or the send fails,
  // the customer can request it again from their account (POST /auth/email/send-verification).
  if (customer.email) await sendVerificationEmail(customer).catch((e) => console.warn('[auth] verification email not sent:', e?.code ?? e?.message));
  res.status(201).json({ user: publicCustomer(customer), token: signToken({ id: customer.id, role: customer.role }) });
});

authRouter.post('/auth/login', credentialLimiter, async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);
  const id = identifier.trim();
  const customer = id.includes('@')
    ? await prisma.customer.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.customer.findUnique({ where: { phone: normalizeIndianPhone(id) ?? '' } });
  const ok = await verifyPassword(password, customer?.passwordHash);
  // One message for unknown account and wrong password: accounts cannot be enumerated.
  if (!customer || !ok) throw new AppError(401, 'Incorrect mobile/email or password', 'INVALID_CREDENTIALS', 'password');
  if (customer.isBlocked) throw new AppError(403, 'This account has been suspended. Please contact the store.', 'ACCOUNT_BLOCKED');
  res.json({ user: publicCustomer(customer), token: signToken({ id: customer.id, role: customer.role }) });
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.user!.id } });
  if (!c) throw notFound('Account');
  res.json({ user: publicCustomer(c) });
});

/**
 * POC ONLY: signs in the seeded demo customer. Disabled automatically in production (see config/env.ts).
 */
authRouter.post('/auth/demo-login', async (_req, res) => {
  if (!env.ENABLE_DEMO_LOGIN) throw new AppError(404, 'Not found', 'NOT_FOUND');
  const customer = await prisma.customer.findFirst({ where: { isDemo: true, role: 'CUSTOMER' } });
  if (!customer) throw new AppError(503, 'Demo customer is not seeded. Run `npm run seed`.', 'NOT_SEEDED');
  res.json({ user: publicCustomer(customer), token: signToken({ id: customer.id, role: 'CUSTOMER' }), demo: true });
});
