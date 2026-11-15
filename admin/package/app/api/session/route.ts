import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_PATH } from '@/lib/base';
import { NOT_CONFIGURED, apiBase } from '@/lib/serverEnv';

const COOKIE = 'sh_admin';

const cookieOpts = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.COOKIE_SECURE === 'true', path: COOKIE_PATH, maxAge: 8 * 60 * 60 };

/** Sign in: the API token is stored in an httpOnly cookie, so page scripts can never read it. */
export async function POST(req: NextRequest) {
  const API = apiBase();
  if (!API) return NextResponse.json(NOT_CONFIGURED, { status: 500 });
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) return NextResponse.json({ error: { message: 'Enter your email and password' } }, { status: 400 });
  let res: Response;
  try {
    res = await fetch(`${API}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: body.email, password: body.password }), cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: { message: 'Cannot reach the server. Try again shortly.' } }, { status: 502 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: { message: json?.error?.message ?? 'Sign-in failed' } }, { status: res.status });
  const out = NextResponse.json({ user: json.user });
  out.cookies.set(COOKIE, json.token, cookieOpts);
  return out;
}

export async function DELETE() {
  const out = NextResponse.json({ ok: true });
  out.cookies.set(COOKIE, '', { ...cookieOpts, maxAge: 0 });
  return out;
}
