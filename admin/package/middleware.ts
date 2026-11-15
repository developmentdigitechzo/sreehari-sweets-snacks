import { NextResponse, type NextRequest } from 'next/server';

/** Cheap gate: pages need a session cookie. The API re-checks the token and the staff role on every call. */
export function middleware(req: NextRequest) {
  const has = req.cookies.has('sh_admin');
  const { pathname } = req.nextUrl;
  if (!has && pathname !== '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (has && pathname === '/login') {
    const url = req.nextUrl.clone(); // keeps the base path (for example /admin)
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/((?!api/|_next/|favicon.ico).*)'] };
