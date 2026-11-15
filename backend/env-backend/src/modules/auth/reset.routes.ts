import { createHash, randomBytes } from 'node:crypto';
import { emailSchema } from './validators.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { currentEmailSender, devOutbox } from '../email/email.js';
import { passwordSchema } from './auth.schemas.js';
import { hashPassword } from './password.js';

export const resetRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false });

/** Only this hash is stored. The raw token exists only inside the emailed link. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newResetToken = () => randomBytes(32).toString('base64url');

const MAX_REQUESTS_PER_HOUR = 3;

/**
 * Step 1. Always answers the same way for known and unknown emails (no account enumeration).
 * If no email provider is configured the endpoint says so (503) instead of claiming a message was sent.
 */
resetRouter.post('/auth/forgot-password', limiter, async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const sender = currentEmailSender();
  if (!sender) throw new AppError(503, 'Password reset by email is not available because no email provider is configured.', 'EMAIL_NOT_CONFIGURED');

  const generic = { accepted: true, message: 'If an account exists for this email, a reset link has been sent.' };
  const customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  if (!customer) { res.status(202).json(generic); return; }

  // Per-account throttle (in addition to the per-IP limiter): stops mail-bombing one customer.
  const recent = await prisma.passwordResetToken.count({ where: { customerId: customer.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MAX_REQUESTS_PER_HOUR) { res.status(202).json(generic); return; }

  const token = newResetToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { customerId: customer.id, usedAt: null }, data: { usedAt: new Date() } }), // older links stop working
    prisma.passwordResetToken.create({ data: { customerId: customer.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60_000) } }),
  ]);
  const link = `${env.APP_RESET_URL_BASE}?token=${encodeURIComponent(token)}`;
  try {
    await sender.send({
      to: customer.email!,
      subject: 'Reset your Shree Hari password',
      text: `Hello ${customer.name},\n\nUse this link to choose a new password (valid for ${env.RESET_TOKEN_TTL_MINUTES} minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  } catch (e) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash: hashToken(token) } });
    throw e; // a real delivery failure is reported, never hidden behind "sent"
  }
  res.status(202).json(generic);
});

/** Step 2. Single-use token + new password. */
resetRouter.post('/auth/reset-password', limiter, async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(req.body);
  const invalid = new AppError(400, 'This reset link is invalid or has expired. Request a new one.', 'RESET_TOKEN_INVALID');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid;

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    // Only one request can flip usedAt from null: a replayed or concurrent use fails here.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw invalid;
    await tx.customer.update({ where: { id: record.customerId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({ where: { customerId: record.customerId, usedAt: null }, data: { usedAt: new Date() } });
  });
  res.json({ reset: true });
});

/** Development/test only: lets automated tests read the emailed link. Not mounted unless EMAIL_PROVIDER=dev. */
resetRouter.get('/dev/outbox', (_req, res) => {
  if (env.EMAIL_PROVIDER !== 'dev' || env.NODE_ENV === 'production') throw new AppError(404, 'Not found', 'NOT_FOUND');
  res.json(devOutbox());
});
