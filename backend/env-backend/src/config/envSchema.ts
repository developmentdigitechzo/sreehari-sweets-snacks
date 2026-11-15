import { z } from 'zod';

const bool = z
  .string()
  .default('true')
  .transform((v) => v === 'true');
const optional = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  // Hosts sometimes write the mode as "Production" or with a stray space; accept that and normalise it.
  NODE_ENV: z
    .string()
    .default('development')
    .transform((v) => v.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase())
    .pipe(z.enum(['development', 'test', 'production'], { error: (iss) => `must be development, test or production, but the server has ${JSON.stringify(iss.input)}` })),
  /** How many reverse proxies sit in front of the API (cPanel/Passenger = 1), or true/false. Default: 1 in production, off otherwise. */
  TRUST_PROXY: optional,
  // A port number, or (on cPanel / Passenger) a socket path the host hands to the app.
  PORT: z.string().default('4000').transform((v): number | string => (/^\d+$/.test(v) ? Number(v) : v)),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
  UPLOAD_DIR: z.string().default('uploads'),
  /** POC only. Enables POST /auth/demo-login for the seeded demo customer. Must be false in production. */
  ENABLE_DEMO_LOGIN: bool,
  /** Credential endpoints (signup/login/forgot/otp): max requests per minute per IP. Keep low in production. */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),

  /** Staff sign-in attempts per IP per 15 minutes. Keep low in production. */
  ADMIN_LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(8),

  /** Order placements per minute per IP. Keep low in production; raise only for automated tests. */
  CHECKOUT_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(20),

  /* ---- Reverse geocoding (GPS -> address) ---- */
  GEOCODER_PROVIDER: z.enum(['none', 'google']).default('none'),
  GOOGLE_MAPS_API_KEY: optional,

  /* ---- OTP / SMS ---- */
  /** none = disabled (503). dev = codes are returned to the caller and logged; refused in production. twilio = real SMS. */
  OTP_PROVIDER: z.enum(['none', 'dev', 'twilio']).default('none'),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OTP_HOURLY_LIMIT: z.coerce.number().int().min(1).default(5),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM_NUMBER: optional,

  /* ---- Email (password reset) ---- */
  /** none = disabled (503). dev = in-memory outbox + log; refused in production. resend = real email via Resend. */
  EMAIL_PROVIDER: z.enum(['none', 'dev', 'resend']).default('none'),
  EMAIL_FROM: z.string().default('Shree Hari <no-reply@example.com>'),
  RESEND_API_KEY: optional,
  /** Base of the link in the reset email, e.g. shreehari://reset-password or https://app.example.com/reset-password */
  APP_RESET_URL_BASE: z.string().default('shreehari://reset-password'),
  /** Deep link the verification email points to. Use an https page that forwards to the app if email clients strip custom schemes. */
  APP_VERIFY_URL_BASE: z.string().default('shreehari://verify-email'),
  VERIFY_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).default(1440),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).default(30),

  /* ---- Marketing messages (admin broadcasts) ---- */
  /** expo = Expo Push service (needs device tokens from the app). */
  NOTIFY_PUSH_PROVIDER: z.enum(['none', 'expo']).default('none'),
  /** twilio reuses TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER. Indian promotional SMS also needs DLT registration. */
  NOTIFY_SMS_PROVIDER: z.enum(['none', 'twilio']).default('none'),
  /** twilio WhatsApp sender, e.g. whatsapp:+14155238886. Business-initiated messages need an approved template. */
  NOTIFY_WHATSAPP_PROVIDER: z.enum(['none', 'twilio']).default('none'),
  TWILIO_WHATSAPP_FROM: optional,

  /* ---- Payments ---- */
  /** none = online payment disabled (COD only). razorpay = Razorpay (use TEST keys for sandbox). test = automated tests only. */
  PAYMENT_PROVIDER: z.enum(['none', 'razorpay', 'test']).default('none'),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  /** Unpaid online orders older than this are cancelled and their stock released. */
  PAYMENT_PENDING_TTL_MINUTES: z.coerce.number().int().min(5).default(30),
});

export type Env = z.infer<typeof schema>;

/** Cross-field rules: a selected provider must have its credentials; development doubles never run in production. */
export function validateEnv(raw: NodeJS.ProcessEnv): { ok: true; env: Env } | { ok: false; problems: string[] } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const e = parsed.data;
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => { if (!cond) problems.push(msg); };
  need(e.GEOCODER_PROVIDER !== 'google' || !!e.GOOGLE_MAPS_API_KEY, 'GEOCODER_PROVIDER=google requires GOOGLE_MAPS_API_KEY');
  need(e.OTP_PROVIDER !== 'twilio' || (!!e.TWILIO_ACCOUNT_SID && !!e.TWILIO_AUTH_TOKEN && !!e.TWILIO_FROM_NUMBER), 'OTP_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER');
  need((e.NOTIFY_SMS_PROVIDER !== 'twilio' && e.NOTIFY_WHATSAPP_PROVIDER !== 'twilio') || (!!e.TWILIO_ACCOUNT_SID && !!e.TWILIO_AUTH_TOKEN), 'NOTIFY_*_PROVIDER=twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  need(e.NOTIFY_SMS_PROVIDER !== 'twilio' || !!e.TWILIO_FROM_NUMBER, 'NOTIFY_SMS_PROVIDER=twilio requires TWILIO_FROM_NUMBER');
  need(e.NOTIFY_WHATSAPP_PROVIDER !== 'twilio' || !!e.TWILIO_WHATSAPP_FROM, 'NOTIFY_WHATSAPP_PROVIDER=twilio requires TWILIO_WHATSAPP_FROM');
  need(e.EMAIL_PROVIDER !== 'resend' || !!e.RESEND_API_KEY, 'EMAIL_PROVIDER=resend requires RESEND_API_KEY');
  need(e.PAYMENT_PROVIDER !== 'razorpay' || (!!e.RAZORPAY_KEY_ID && !!e.RAZORPAY_KEY_SECRET && !!e.RAZORPAY_WEBHOOK_SECRET), 'PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET');
  if (e.NODE_ENV === 'production') {
    need(!e.ENABLE_DEMO_LOGIN, 'ENABLE_DEMO_LOGIN must be false in production');
    need(e.OTP_PROVIDER !== 'dev', 'OTP_PROVIDER=dev is not allowed in production');
    need(e.EMAIL_PROVIDER !== 'dev', 'EMAIL_PROVIDER=dev is not allowed in production');
    need(e.PAYMENT_PROVIDER !== 'test', 'PAYMENT_PROVIDER=test is not allowed in production');
  }
  return problems.length ? { ok: false, problems } : { ok: true, env: e };
}

