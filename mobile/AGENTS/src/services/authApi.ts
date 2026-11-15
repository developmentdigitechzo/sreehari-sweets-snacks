import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_MOCK_API } from '../data/config';
import { API_URL } from '../config/api';
import type { User } from '../types';
import { normalizePhone, isValidEmail } from '../utils/validation';
import { sleep, uid } from '../utils/format';
import { session } from './session';

export type AuthResult = { user: User; token: string };
export type SignupInput = { name: string; phone: string; email?: string; password: string; consent: boolean };
export type LoginInput = { identifier: string; password: string };

/** Error with an optional field so forms can show the message under the right input. */
export class AuthError extends Error {
  constructor(message: string, public field?: 'identifier' | 'phone' | 'email' | 'password' | 'name') {
    super(message);
  }
}

export interface AuthApi {
  /** 'demo' = local accounts on this device. 'live' = the backend. Never claims OTP/SMS verification. */
  mode: 'demo' | 'live';
  signup(input: SignupInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  /** Present only where a demo customer is available. */
  demoLogin?: () => Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<{ sent: boolean; message: string }>;
  /** Live only. */
  resetPassword?: (token: string, password: string) => Promise<void>;
  /** Live only: emails a verification link to the signed-in customer's address. */
  sendEmailVerification?: () => Promise<{ sent: boolean; alreadyVerified?: boolean }>;
  /** Live only: completes verification with the token from the emailed link. */
  verifyEmail?: (token: string) => Promise<void>;
  /** Live only: re-reads the signed-in customer (e.g. to pick up emailVerified). */
  refreshUser?: () => Promise<User>;
  requestOtp?: (phone: string) => Promise<{ delivery: 'sms' | 'development'; devCode?: string; cooldownSeconds: number }>;
  verifyOtp?: (phone: string, code: string) => Promise<AuthResult>;
  /** Live only: sign-up with a code. 1) a code goes to a number that has no account, 2) the code proves the number and returns a short-lived proof, 3) the name (and optional email) creates the account. */
  requestSignupOtp?: (phone: string) => Promise<{ delivery: 'sms' | 'development'; devCode?: string; cooldownSeconds: number }>;
  verifySignupOtp?: (phone: string, code: string) => Promise<{ signupToken: string }>;
  completeSignup?: (input: { signupToken: string; name: string; email?: string; consent: boolean }) => Promise<AuthResult>;
}

/* =========================================================================
 * DEMO AUTH (mock mode). Accounts live in AsyncStorage on this device only.
 * The "hash" below is a convenience so plain passwords are not stored; it is NOT
 * cryptographically secure. Real accounts use the backend (scrypt) below.
 * ========================================================================= */
type DemoAccount = { id: string; name: string; phone: string; email?: string; salt: string; hash: string };
const DEMO_KEY = 'shree-hari-demo-accounts';

function weakHash(input: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

async function readAccounts(): Promise<DemoAccount[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(DEMO_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

const publicUser = (a: DemoAccount): User => ({ id: a.id, name: a.name, phone: a.phone, email: a.email });

const demoAuth: AuthApi = {
  mode: 'demo',
  async signup({ name, phone, email, password, consent }) {
    await sleep(500);
    if (!consent) throw new AuthError('Please accept the terms to continue');
    const accounts = await readAccounts();
    const ph = normalizePhone(phone);
    if (accounts.some((a) => a.phone === ph)) throw new AuthError('An account with this mobile number already exists. Try logging in.', 'phone');
    if (email && accounts.some((a) => a.email?.toLowerCase() === email.trim().toLowerCase())) throw new AuthError('An account with this email already exists.', 'email');
    const salt = uid('s');
    const acc: DemoAccount = { id: uid('user'), name: name.trim(), phone: ph, email: email?.trim() || undefined, salt, hash: weakHash(salt + password) };
    await AsyncStorage.setItem(DEMO_KEY, JSON.stringify([...accounts, acc]));
    return { user: publicUser(acc), token: `demo.${acc.id}` };
  },
  async login({ identifier, password }) {
    await sleep(450);
    const accounts = await readAccounts();
    const id = identifier.trim();
    const acc = accounts.find((a) => (isValidEmail(id) ? a.email?.toLowerCase() === id.toLowerCase() : a.phone === normalizePhone(id)));
    // Same message for "no such account" and "wrong password" so accounts cannot be probed.
    if (!acc || acc.hash !== weakHash(acc.salt + password)) throw new AuthError('Incorrect mobile/email or password', 'password');
    return { user: publicUser(acc), token: `demo.${acc.id}` };
  },
  async demoLogin() {
    await sleep(300);
    return { user: { id: 'demo-ramesh', name: 'Ramesh Kumar', phone: '+919876543210', email: 'ramesh.demo@example.com', isDemo: true }, token: 'demo.demo-ramesh' };
  },
  async requestPasswordReset() {
    await sleep(400);
    // Honest: nothing is sent.
    return { sent: false, message: 'Demo mode: no email or SMS is sent. Password reset will be available once the live backend and a message provider are connected.' };
  },
};

/* =========================================================================
 * LIVE AUTH (backend). Passwords are hashed server-side (scrypt); tokens are JWTs.
 * ========================================================================= */
async function post<T>(path: string, body: unknown, authed = false): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authed) {
    const token = session.get();
    if (!token) throw new AuthError('Please sign in to continue');
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new AuthError('Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && authed) {
    session.rejected();
    throw new AuthError('Your session ended. Please sign in again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.field);
  return json as T;
}

const liveAuth: AuthApi = {
  mode: 'live',
  signup: (input) => post<AuthResult>('/auth/signup', { ...input, phone: normalizePhone(input.phone) }),
  login: (input) => post<AuthResult>('/auth/login', input),
  async demoLogin() {
    return post<AuthResult>('/auth/demo-login', {});
  },
  async requestPasswordReset(email) {
    const r = await post<{ message: string }>('/auth/forgot-password', { email });
    return { sent: true, message: r.message };
  },
  async resetPassword(token, password) {
    await post('/auth/reset-password', { token, password });
  },
  async sendEmailVerification() {
    return post<{ sent: boolean; alreadyVerified?: boolean }>('/auth/email/send-verification', {}, true);
  },
  async verifyEmail(token) {
    await post('/auth/email/verify', { token });
  },
  async refreshUser() {
    const token = session.get();
    if (!token) throw new AuthError('Please sign in to continue');
    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new AuthError('Cannot reach the server. Check your connection and try again.');
    }
    if (res.status === 401) {
      session.rejected();
      throw new AuthError('Your session ended. Please sign in again.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError(json?.error?.message ?? `Request failed (${res.status})`);
    return json.user as User;
  },
  async requestOtp(phone) {
    return post('/auth/otp/request', { phone: normalizePhone(phone), purpose: 'login' });
  },
  async verifyOtp(phone, code) {
    return post<AuthResult>('/auth/otp/verify', { phone: normalizePhone(phone), purpose: 'login', code });
  },
  async requestSignupOtp(phone) {
    return post('/auth/otp/request', { phone: normalizePhone(phone), purpose: 'signup' });
  },
  async verifySignupOtp(phone, code) {
    return post<{ signupToken: string }>('/auth/otp/verify', { phone: normalizePhone(phone), purpose: 'signup', code });
  },
  async completeSignup(input) {
    return post<AuthResult>('/auth/signup/complete', input);
  },
};

export const authApi: AuthApi = USE_MOCK_API ? demoAuth : liveAuth;
