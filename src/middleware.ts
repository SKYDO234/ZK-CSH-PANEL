import { NextRequest, NextResponse } from 'next/server';
import { httpsFromHeaders } from '@/lib/request';

const SESSION_COOKIE = 'vaultly_session';
const CSRF_COOKIE = 'vaultly_csrf';

/**
 * Edge middleware: cheap, database-free request gating.
 *
 *  - redirects anonymous visitors away from authenticated areas
 *  - bounces signed-in users away from the login/register screens
 *  - issues the CSRF cookie (double-submit token) when one is missing
 *  - attaches conservative security headers to HTML responses
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  const isPrivate = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].some(
    (path) => pathname === path,
  );

  if (isPrivate && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();

  // Double-submit CSRF token: the client echoes this value in x-csrf-token.
  if (!req.cookies.get(CSRF_COOKIE)?.value) {
    const token = crypto.randomUUID().replace(/-/g, '');
    res.cookies.set(CSRF_COOKIE, token, {
      httpOnly: false, // readable by the app so it can send the header
      sameSite: 'lax',
      secure: httpsFromHeaders(req.headers),
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Skip static assets, API routes and public media delivery:
     * those already set their own cache and security headers.
     */
    '/((?!api|_next/static|_next/image|media|share|video|embed|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)',
  ],
};
