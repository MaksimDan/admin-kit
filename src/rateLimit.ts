// Lightweight in-memory fixed-window rate limiter. No external dependencies.
//
// CAVEAT: counters live in the process memory. On multi-instance / serverless
// deployments each instance keeps its own counters and they reset on cold
// start, so the effective global limit is (limit x live instances). For a
// single-admin site this still meaningfully slows online brute force and email
// abuse; back it with a shared store (e.g. Upstash/Redis) if you need a hard
// cross-instance guarantee.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Occasionally drop expired buckets so the map cannot grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

// Records one hit against `key` and reports whether it is within `limit` per
// `windowMs`. Call once per request you want to throttle.
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

// Best-effort client IP from forwarded headers. Accepts a web Headers object or
// the plain header record next-auth passes to authorize().
export function clientIpFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
): string {
  if (!headers) return 'unknown';
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return get('x-real-ip') ?? 'unknown';
}
