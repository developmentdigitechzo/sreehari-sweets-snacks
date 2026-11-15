import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createLimiters } from './middleware/rateLimits.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { otpRouter } from './modules/otp/otp.routes.js';
import { paymentsRouter, webhookHandler } from './modules/payments/payments.routes.js';
import { resetRouter } from './modules/auth/reset.routes.js';
import { verifyRouter } from './modules/auth/verify.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { geocodeRouter } from './modules/geocode/geocode.routes.js';
import { weatherRouter } from './modules/weather/weather.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { serviceabilityRouter } from './modules/serviceability/serviceability.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';

import { adminAuthRouter } from './modules/admin/admin.auth.routes.js';
import { adminBroadcastRouter } from './modules/admin/broadcast.routes.js';
import { adminCatalogRouter } from './modules/admin/catalog.routes.js';
import { adminCustomersRouter } from './modules/admin/customers.routes.js';
import { adminDashboardRouter } from './modules/admin/dashboard.routes.js';
import { adminImportRouter } from './modules/admin/import.routes.js';
import { adminInventoryRouter } from './modules/admin/inventory.routes.js';
import { adminOffersRouter } from './modules/admin/offers.routes.js';
import { adminOrdersRouter } from './modules/admin/orders.admin.routes.js';
import { returnsRouter } from './modules/admin/returns.routes.js';
import { adminSettingsRouter } from './modules/admin/settings.routes.js';

import { trackChanges } from './modules/sync/changes.js';
import { rewriteUploadLinks } from './modules/sync/publicUrl.js';
import { syncRouter } from './modules/sync/sync.routes.js';

export function createApp() {
  const app = express();
  // Behind the host's reverse proxy the client address arrives in X-Forwarded-For; without this every visitor looks like the proxy and shares one rate limit.
  const proxy = env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? '1' : 'false');
  app.set('trust proxy', proxy === 'true' ? true : proxy === 'false' ? false : /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: false }));
  // 600 requests / 15 min per IP for the public app; signed-in staff get their own per-person budget (see middleware/rateLimits.ts).
  const { ipLimiter, staffLimiter } = createLimiters();
  app.use(ipLimiter);
  app.use(staffLimiter);

  // Data changes are announced only after the request that made them succeeded (see modules/sync/changes.ts).
  app.use('/api', trackChanges);
  // Dynamic data must never be served from a stale HTTP cache: shared data revalidates (ETag => cheap 304), personal data is never stored.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', /^\/(me|orders|admin|auth|payments|otp)/.test(req.path) ? 'no-store' : 'no-cache');
    next();
  });
  // Stored upload links always point at the address the caller used to reach this API.
  app.use(['/api/catalog', '/api/orders', '/api/me'], rewriteUploadLinks);

  // Uploads handle their own raw body parser; JSON parsing is limited everywhere else.
  app.use('/api', uploadsRouter);
  // Webhook signatures are computed over the exact raw bytes, so this route uses a raw body parser (before express.json).
  app.post('/api/webhooks/payments', express.raw({ type: '*/*', limit: '200kb' }), webhookHandler);
  // CSV imports carry the whole file as text (up to 2 MB); everything else stays at 100 kb. Must come before the general parser.
  app.use('/api/admin/import', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '100kb' }));

  // What this server can really do. The app only offers features that are switched on here. No secrets are exposed.
  app.get('/api/capabilities', (_req, res) =>
    res.json({
      otp: env.OTP_PROVIDER !== 'none' ? (env.OTP_PROVIDER === 'dev' ? 'development' : 'sms') : 'none',
      passwordReset: env.EMAIL_PROVIDER !== 'none',
      emailVerification: env.EMAIL_PROVIDER !== 'none',
      payments: env.PAYMENT_PROVIDER === 'none' ? 'none' : env.PAYMENT_PROVIDER === 'test' ? 'test' : 'razorpay',
      reverseGeocoding: env.GEOCODER_PROVIDER !== 'none',
    }),
  );
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shree-hari-api', mode: 'poc' }));
  app.use('/api', authRouter);
  app.use('/api', resetRouter);
  app.use('/api', verifyRouter);
  app.use('/api', otpRouter);
  app.use('/api', paymentsRouter);
  app.use('/api', syncRouter);
  app.use('/api', catalogRouter);
  // Admin routes carry their own per-route permission checks; they must sit before routers that apply auth to everything after them.
  for (const r of [adminAuthRouter, adminDashboardRouter, adminCatalogRouter, adminImportRouter, adminInventoryRouter, adminOrdersRouter, returnsRouter, adminCustomersRouter, adminOffersRouter, adminBroadcastRouter, adminSettingsRouter]) app.use('/api', r);

  app.use('/api', weatherRouter);
  app.use('/api', geocodeRouter);
  // Public: must be mounted before customersRouter, which requires sign-in for every path after it.
  app.use('/api', serviceabilityRouter);
  app.use('/api', customersRouter);
  app.use('/api', ordersRouter);

  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '7d', index: false }));
  // The pictures that ship inside the phone app, so the admin panel (a browser) can show them too.
  app.use('/seed-images', express.static(path.resolve('seed-images'), { maxAge: '7d', index: false }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
