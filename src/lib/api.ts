import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { getSession, type SessionContext } from './auth';
import { hit } from './rate-limit';
import { getSettings } from './settings';
import { clientIp } from './request';
import type { Permission } from './permissions';
import { verifyCsrf } from './csrf';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function fail(status: number, message: string, code = 'error', details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: { message, code, details } }, { status });
}

/** Wraps a handler so thrown ApiErrors/ZodErrors become consistent JSON. */
/**
 * Route params. Dynamic segments are strings; catch-all segments are arrays.
 * Routes with catch-all params must pass their exact shape as the type argument
 * so Next.js route type-checking stays sound:
 *   handler<{ token: string; path: string[] }>(...)
 */
export function handler<T extends Record<string, string | string[]> = Record<string, string>>(
  fn: (req: NextRequest, ctx: { params: Promise<T> }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: { params: Promise<T> }) => {
    try {
      const response = await fn(req, ctx);
      applySecurityHeaders(response);
      return response;
    } catch (err) {
      if (err instanceof ApiError) {
        const res = fail(err.status, err.message, err.code, err.details);
        applySecurityHeaders(res);
        return res;
      }
      if (err instanceof ZodError) {
        const res = fail(422, 'Validation failed', 'validation_error', err.flatten());
        applySecurityHeaders(res);
        return res;
      }
      console.error('[api] unhandled error', err);
      const res = fail(500, 'Something went wrong. Please try again.', 'internal_error');
      applySecurityHeaders(res);
      return res;
    }
  };
}

/** Server-side security headers applied to every API response. */
export function applySecurityHeaders(response: Response) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function requireUser(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'You must be signed in.', 'unauthenticated');
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const session = await requireUser();
  if (!session.can(permission)) throw new ApiError(403, 'You do not have permission to do that.', 'forbidden');
  return session;
}

/** General rate limit for authenticated API traffic. */
export async function enforceRateLimit(req: NextRequest, bucket = 'api', limitOverride?: number) {
  const settings = await getSettings();
  const limit = limitOverride ?? settings.security.rateLimitPerMinute;
  const result = hit(`${bucket}:${clientIp(req)}`, limit, 60_000);
  if (!result.ok) {
    throw new ApiError(429, 'Too many requests. Please slow down.', 'rate_limited', {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid request', 'validation_error', parsed.error.flatten());
  }
  return parsed.data;
}

/**
 * CSRF protection for state-changing browser requests.
 *
 * Defence in depth: session cookies are SameSite=Lax (which already blocks
 * cross-site POSTs), plus a signed double-submit token checked whenever the
 * request carries an Origin header that differs from ours.
 */
export async function enforceCsrf(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('host');
    try {
      if (host && new URL(origin).host !== host) {
        throw new ApiError(403, 'Cross-site request blocked.', 'csrf');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
  }
  const valid = await verifyCsrf(req);
  if (!valid) throw new ApiError(403, 'Your session token expired. Please refresh the page.', 'csrf');
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.', 'bad_request');
  }
}

export function paginationFrom(req: NextRequest, defaults = { page: 1, perPage: 24 }) {
  const url = new URL(req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '', 10) || defaults.page);
  const perPageRaw = Number.parseInt(url.searchParams.get('perPage') ?? '', 10) || defaults.perPage;
  const perPage = Math.min(100, Math.max(1, perPageRaw));
  return { page, perPage, offset: (page - 1) * perPage };
}
