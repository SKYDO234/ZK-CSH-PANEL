import { cookies } from 'next/headers';
import { isHttpsRequest } from './request';
import { randomToken, signValue, verifySignedValue } from './crypto';

export const CSRF_HEADER = 'x-csrf-token';

/** Issues (or reuses) the CSRF token for the current browser session. */
export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get('vaultly_csrf')?.value;
  if (existing) {
    const { valid } = verifySignedValue(existing);
    if (valid) return existing;
  }
  const token = signValue(randomToken(24));
  try {
    store.set('vaultly_csrf', token, {
      httpOnly: false, // the client JS must echo it back in a header
      sameSite: 'lax',
      secure: await isHttpsRequest(),
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch {
    // Called from a context where cookies are read-only (RSC render).
  }
  return token;
}

export async function verifyCsrf(req: Request): Promise<boolean> {
  const headerToken = req.headers.get(CSRF_HEADER);
  const store = await cookies();
  const cookieToken = store.get('vaultly_csrf')?.value;
  if (!headerToken || !cookieToken) return false;
  if (headerToken !== cookieToken) return false;
  return verifySignedValue(cookieToken).valid;
}
