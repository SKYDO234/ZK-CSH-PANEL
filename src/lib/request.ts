import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { trustProxy } from './env';

/**
 * Client IP resolution. Honours X-Forwarded-For only when the deployment
 * declares that it sits behind a trusted proxy (TRUST_PROXY=true or production),
 * which prevents clients from spoofing their own IP to dodge rate limits.
 */
export function clientIp(req: NextRequest | Request): string {
  const headers = req.headers;
  if (trustProxy()) {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = headers.get('x-real-ip');
    if (realIp) return realIp.trim();
    const cfIp = headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();
  }
  return '127.0.0.1';
}

/**
 * True when the current request reached us over HTTPS, directly or through a
 * trusted proxy. Cookies flagged `Secure` are dropped by browsers on plain
 * HTTP, which would make sign-in fail silently — so decide per request.
 */
export function httpsFromHeaders(h: Headers): boolean {
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto) return proto === 'https';
  const configured = process.env.APP_URL;
  if (configured) return configured.startsWith('https://');
  return false;
}

export async function isHttpsRequest(): Promise<boolean> {
  return httpsFromHeaders(await headers());
}

export function userAgent(req: NextRequest | Request): string {
  return (req.headers.get('user-agent') ?? '').slice(0, 500);
}

/** Canonical origin for absolute link generation, based on the incoming request. */
export function requestOrigin(req: NextRequest | Request): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, '');
  if (process.env.FORCE_CONFIGURED_ORIGIN === 'true' && configured) return configured;
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = forwardedHost || req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
  }
  return configured ?? 'http://localhost:3000';
}
