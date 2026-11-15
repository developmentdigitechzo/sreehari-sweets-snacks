import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { signToken } from './auth.js';
import { createLimiters } from './rateLimits.js';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';

before(async () => {
  const { ipLimiter, staffLimiter } = createLimiters({ ipLimit: 3, staffLimit: 6 });
  const app = express();
  app.set('trust proxy', false);
  app.use(ipLimiter);
  app.use(staffLimiter);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

const hit = async (token?: string) => (await fetch(`${base}/ping`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;
const many = async (n: number, token?: string) => { const out: number[] = []; for (let i = 0; i < n; i++) out.push(await hit(token)); return out; };

describe('rate limits', () => {
  test('anonymous callers share the per-IP budget', async () => {
    assert.deepEqual(await many(4), [200, 200, 200, 429]);
  });

  test('staff are counted per person, not per IP: they are not stopped by the IP budget that anonymous traffic already used up', async () => {
    const a = signToken({ id: 'staff-a', role: 'MANAGER' });
    const b = signToken({ id: 'staff-b', role: 'SUPER_ADMIN' });
    assert.deepEqual(await many(6, a), [200, 200, 200, 200, 200, 200]);
    assert.equal(await hit(a), 429); // a's own budget is used up
    assert.equal(await hit(b), 200); // b has a separate budget
  });

  test('customer tokens and forged or expired tokens stay on the IP budget', async () => {
    const customer = signToken({ id: 'cust-1', role: 'CUSTOMER' });
    const forged = jwt.sign({ id: 'x', role: 'SUPER_ADMIN' }, 'not-the-real-secret');
    const expired = jwt.sign({ id: 'y', role: 'SUPER_ADMIN' }, env.JWT_SECRET, { expiresIn: -10 });
    // the IP budget is already spent by the first test, so each of these is refused
    assert.equal(await hit(customer), 429);
    assert.equal(await hit(forged), 429);
    assert.equal(await hit(expired), 429);
  });
});
