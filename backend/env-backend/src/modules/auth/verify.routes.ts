import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { requireActive, requireAuth } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { currentEmailSender } from '../email/email.js';
import { hashToken, newResetToken } from './reset.routes.js';

export const verifyRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false });

const MAX_SENDS_PER_HOUR = 3;

type Who = { id: string; name: string; email: string | null; emailVerifiedAt: Date | null };

/**
 * Emails a single-use verification link for the customer's CURRENT email address.
 * Returns 'sent' | 'already_verified' | 'no_email' | 'throttled'. Throws AppError(503) when no email provider is configured and
 * AppError(502) when the provider rejects the message, so a delivery failure is never reported as "sent".
 */
export async function sendVerificationEmail(c: Who): Promise<'sent' | 'already_verified' | 'no_email' | 'throttled'> {
  if (!c.email) return 'no_email';
  if (c.emailVerifiedAt) return 'already_verified';
  const sender = currentEmailSender();
  if (!sender) throw new AppError(503, 'Email verification is not available because no email provider is configured.', 'EMAIL_NOT_CONFIGURED');

  const recent = await prisma.emailVerificationToken.count({ where: { customerId: c.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MAX_SENDS_PER_HOUR) return 'throttled';

  const token = newResetToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({ where: { customerId: c.id, usedAt: null }, data: { usedAt: new Date() } }), // older links stop working
    prisma.emailVerificationToken.create({
      data: { customerId: c.id, email: c.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + env.VERIFY_TOKEN_TTL_MINUTES * 60_000) },
    }),
  ]);
  const link = `${env.APP_VERIFY_URL_BASE}?token=${encodeURIComponent(token)}`;
  try {
    await sender.send({
      to: c.email,
      subject: 'Verify your email for Shree Hari',
      text: `Hello ${c.name},\n\nConfirm that this is your email address (the link is valid for ${Math.round(env.VERIFY_TOKEN_TTL_MINUTES / 60)} hours):\n${link}\n\nIf you did not create an account, you can ignore this email.`,
    });
  } catch (e) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash: hashToken(token) } });
    throw e;
  }
  return 'sent';
}

/** Signed-in customer asks for a (new) verification email. */
verifyRouter.post('/auth/email/send-verification', limiter, requireAuth, requireActive, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.user!.id } });
  if (!c) throw notFound('Account');
  const result = await sendVerificationEmail(c);
  if (result === 'no_email') throw new AppError(400, 'Add an email address to your profile first.', 'EMAIL_MISSING');
  if (result === 'already_verified') { res.json({ sent: false, alreadyVerified: true }); return; }
  if (result === 'throttled') throw new AppError(429, 'Too many verification emails. Please try again in an hour.', 'RATE_LIMITED');
  res.status(202).json({ sent: true });
});

/** The link in the email lands here (through the app). Single use, expires, and only valid for the address it was sent to. */
verifyRouter.post('/auth/email/verify', limiter, async (req, res) => {
  const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.body);
  const invalid = new AppError(400, 'This verification link is invalid or has expired. Request a new one.', 'VERIFY_TOKEN_INVALID');
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid;
  // The customer changed their email after the link was sent: this link proves nothing about the new address.
  if (!record.customer.email || record.customer.email.toLowerCase() !== record.email.toLowerCase()) throw invalid;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw invalid; // replayed or concurrent use
    await tx.customer.update({ where: { id: record.customerId }, data: { emailVerifiedAt: new Date() } });
    await tx.emailVerificationToken.updateMany({ where: { customerId: record.customerId, usedAt: null }, data: { usedAt: new Date() } });
  });
  res.json({ verified: true });
});
