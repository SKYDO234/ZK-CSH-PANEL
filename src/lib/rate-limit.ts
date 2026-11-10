/**
 * Lightweight in-process rate limiter (sliding window).
 *
 * Adequate for a single-instance deployment. For multi-instance/serverless
 * deployments, swap `hit()` for a Redis (or Upstash) backed implementation —
 * the interface is intentionally tiny.
 */

type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as { __vaultlyRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalForLimiter.__vaultlyRate ?? new Map();
globalForLimiter.__vaultlyRate = buckets;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function hit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const ok = bucket.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Periodically drop expired buckets so memory does not grow unbounded. */
export function sweep() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function reset(key: string) {
  buckets.delete(key);
}
