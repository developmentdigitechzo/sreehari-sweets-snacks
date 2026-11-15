import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_PATH } from '@/lib/base';
import { NOT_CONFIGURED, apiBase } from '@/lib/serverEnv';

export const dynamic = 'force-dynamic';

/**
 * Same-origin gateway to the Shree Hari API. It adds the bearer token from the httpOnly cookie, so the browser
 * never holds the token, and it only forwards to the configured API (the path cannot point anywhere else).
 */
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const API = apiBase();
  if (!API) return NextResponse.json(NOT_CONFIGURED, { status: 500 });
  const token = req.cookies.get('sh_admin')?.value;
  if (!token) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in again' } }, { status: 401 });
  const { path } = await ctx.params;
  if (path.some((p) => p === '..' || p === '.' || p.includes('\\'))) return NextResponse.json({ error: { message: 'Bad path' } }, { status: 400 });
  const url = `${API}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const ct = req.headers.get('content-type');
  if (ct) headers['Content-Type'] = ct;
  let res: Response;
  try {
    res = await fetch(url, { method: req.method, headers, body: hasBody ? Buffer.from(await req.arrayBuffer()) : undefined, cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM', message: 'Cannot reach the server. Check your connection and try again.' } }, { status: 502 });
  }
  const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status });
  out.headers.set('Cache-Control', 'no-store');
  const rct = res.headers.get('content-type');
  if (rct) out.headers.set('Content-Type', rct);
  const cd = res.headers.get('content-disposition');
  if (cd) out.headers.set('Content-Disposition', cd);
  // The token expired or the account lost access: drop the cookie so the next page load goes to sign-in.
  if (res.status === 401) out.cookies.set('sh_admin', '', { path: COOKIE_PATH, maxAge: 0 });
  return out;
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
