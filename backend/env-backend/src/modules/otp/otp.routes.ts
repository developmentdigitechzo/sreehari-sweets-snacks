import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { type AuthUser, signToken } from '../../middleware/auth.js';
import { AppError } from '../../utils/errors.js';
import { phoneSchema } from '../auth/auth.schemas.js';
import { emailSchema, nameSchema } from '../auth/validators.js';
import { sendVerificationEmail } from '../auth/verify.routes.js';
import { canRequestOtp, evaluateAttempt, generateCode, hashCode, type OtpConfig } from './otp.policy.js';
import { currentSender } from './otp.senders.js';
import { SIGNUP_TOKEN_SECONDS, readSignupToken, signSignupToken } from './signupToken.js';

export const otpRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false });
const cfg: OtpConfig = { ttlSeconds: env.OTP_TTL_SECONDS, resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, maxAttempts: env.OTP_MAX_ATTEMPTS, hourlyLimit: env.OTP_HOURLY_LIMIT };

const purposeSchema = z.enum(['login', 'verify_phone', 'signup']);
const requestSchema = z.object({ phone: phoneSchema, purpose: purposeSchema });
const verifySchema = z.object({ phone: phoneSchema, purpose: purposeSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });

function optionalUser(header?: string): AuthUser | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    const p = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    return { id: p.id, role: p.role };
  } catch {
    return undefined;
  }
}

const publicCustomer = (c: { id: string; name: string; phone: string; email: string | null }) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email ?? undefined });

/**
 * Request a one-time code.
 *  - purpose=verify_phone needs a signed-in customer and only their own number.
 *  - purpose=login answers identically for known and unknown numbers (no account enumeration) and only sends for known ones.
 *  - purpose=signup is for a number that has no account yet. A number that already has one is told so (409), the same as the
 *    password sign-up does, so the customer can log in instead.
 * Never reports "sent" unless the provider accepted the message.
 */
otpRouter.post('/auth/otp/request', limiter, async (req, res) => {
  const { phone, purpose } = requestSchema.parse(req.body);
  const sender = currentSender();
  if (!sender) throw new AppError(503, 'One-time codes are not available because no SMS provider is configured.', 'OTP_NOT_CONFIGURED');

  const user = optionalUser(req.header('authorization'));
  let customer = null;
  if (purpose === 'verify_phone') {
    if (!user) throw new AppError(401, 'Sign in to verify your number.', 'UNAUTHORIZED');
    customer = await prisma.customer.findUnique({ where: { id: user.id } });
    if (!customer || customer.phone !== phone) throw new AppError(403, 'You can only verify your own number.', 'FORBIDDEN');
  } else if (purpose === 'signup') {
    if (await prisma.customer.findUnique({ where: { phone } })) throw new AppError(409, 'An account with this mobile number already exists. Try logging in.', 'CONFLICT', 'phone');
  } else {
    customer = await prisma.customer.findUnique({ where: { phone } });
  }

  const now = new Date();
  const base = { accepted: true, cooldownSeconds: cfg.resendCooldownSeconds, expiresInSeconds: cfg.ttlSeconds };
  if (!customer && purpose !== 'signup') { res.status(202).json(base); return; } // login for an unknown number: same shape, nothing is sent

  const [last, countLastHour] = await Promise.all([
    prisma.otpChallenge.findFirst({ where: { phone, purpose }, orderBy: { createdAt: 'desc' } }),
    prisma.otpChallenge.count({ where: { phone, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
  ]);
  const decision = canRequestOtp({ now, lastCreatedAt: last?.createdAt, countLastHour }, cfg);
  if (!decision.ok) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new AppError(429, decision.reason === 'cooldown' ? `Please wait ${decision.retryAfterSeconds}s before requesting another code.` : 'Too many codes requested. Try again later.', 'OTP_RATE_LIMITED');
  }

  const code = generateCode();
  const challenge = await prisma.otpChallenge.create({
    data: { phone, purpose, codeHash: hashCode(env.JWT_SECRET, phone, code), expiresAt: new Date(now.getTime() + cfg.ttlSeconds * 1000) },
  });
  try {
    const delivery = await sender.send(phone, code);
    res.status(202).json({ ...base, delivery: delivery.delivery, ...(delivery.devCode ? { devCode: delivery.devCode } : {}) });
  } catch (e) {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw e;
  }
});

/** Verify a code. Single use, attempt-limited, time-limited. */
otpRouter.post('/auth/otp/verify', limiter, async (req, res) => {
  const { phone, purpose, code } = verifySchema.parse(req.body);
  if (!currentSender()) throw new AppError(503, 'One-time codes are not available because no SMS provider is configured.', 'OTP_NOT_CONFIGURED');
  const user = optionalUser(req.header('authorization'));
  if (purpose === 'verify_phone' && !user) throw new AppError(401, 'Sign in to verify your number.', 'UNAUTHORIZED');

  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({ where: { phone, purpose, consumedAt: null }, orderBy: { createdAt: 'desc' } });
  const invalid = new AppError(401, 'That code is not valid. Request a new one.', 'OTP_INVALID');
  if (!challenge) throw invalid;

  const outcome = evaluateAttempt({ now, code, challenge }, cfg, (c) => hashCode(env.JWT_SECRET, phone, c));
  if (outcome.result === 'wrong') {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(401, `Incorrect code. ${outcome.attemptsLeft} attempt${outcome.attemptsLeft === 1 ? '' : 's'} left.`, 'OTP_WRONG');
  }
  if (outcome.result === 'expired') throw new AppError(410, 'This code has expired. Request a new one.', 'OTP_EXPIRED');
  if (outcome.result === 'locked') throw new AppError(429, 'Too many wrong attempts. Request a new code.', 'OTP_LOCKED');
  if (outcome.result === 'used') throw invalid;

  // Single use: only one concurrent request can flip consumedAt from null.
  const claimed = await prisma.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now } });
  if (claimed.count !== 1) throw invalid;

  if (purpose === 'verify_phone') {
    const me = await prisma.customer.findUnique({ where: { id: user!.id } });
    if (!me || me.phone !== phone) throw new AppError(403, 'You can only verify your own number.', 'FORBIDDEN');
    await prisma.customer.update({ where: { id: me.id }, data: { phoneVerifiedAt: now } });
    res.json({ verified: true });
    return;
  }
  if (purpose === 'signup') {
    // The number is proven. Nothing is created yet: the customer still has to give their name (POST /auth/signup/complete).
    if (await prisma.customer.findUnique({ where: { phone } })) throw new AppError(409, 'An account with this mobile number already exists. Try logging in.', 'CONFLICT', 'phone');
    res.json({ verified: true, signupToken: signSignupToken(env.JWT_SECRET, phone), expiresInSeconds: SIGNUP_TOKEN_SECONDS });
    return;
  }
  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) throw invalid;
  if (customer.isBlocked) throw new AppError(403, 'This account has been suspended. Please contact the store.', 'ACCOUNT_BLOCKED');
  const updated = await prisma.customer.update({ where: { id: customer.id }, data: { phoneVerifiedAt: customer.phoneVerifiedAt ?? now } });
  res.json({ user: publicCustomer(updated), token: signToken({ id: updated.id, role: updated.role }) });
});

const completeSchema = z.object({
  signupToken: z.string().min(10).max(2000),
  name: nameSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  consent: z.literal(true, { message: 'Please accept the terms to continue' }),
});

/**
 * Finish sign-up after the number was verified by a code: the customer gives their name (and optionally an email) and the account is
 * created, with the phone already marked verified. There is no password; the customer signs in with a code (or sets a password later).
 */
otpRouter.post('/auth/signup/complete', limiter, async (req, res) => {
  const input = completeSchema.parse(req.body);
  const proof = readSignupToken(env.JWT_SECRET, input.signupToken);
  if (!proof) throw new AppError(401, 'Your number could not be confirmed. Please verify it again.', 'SIGNUP_TOKEN_INVALID');
  const [byPhone, byEmail] = await Promise.all([
    prisma.customer.findUnique({ where: { phone: proof.phone } }),
    input.email ? prisma.customer.findUnique({ where: { email: input.email.toLowerCase() } }) : null,
  ]);
  if (byPhone) throw new AppError(409, 'An account with this mobile number already exists. Try logging in.', 'CONFLICT', 'phone');
  if (byEmail) throw new AppError(409, 'An account with this email already exists.', 'CONFLICT', 'email');
  const customer = await prisma.customer.create({ data: { name: input.name, phone: proof.phone, email: input.email?.toLowerCase(), phoneVerifiedAt: new Date() } });
  if (customer.email) await sendVerificationEmail(customer).catch((e) => console.warn('[auth] verification email not sent:', e?.code ?? e?.message));
  res.status(201).json({
    user: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email ?? undefined, emailVerified: customer.email ? false : undefined },
    token: signToken({ id: customer.id, role: customer.role }),
  });
});
