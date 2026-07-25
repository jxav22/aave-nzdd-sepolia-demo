/**
 * Per-IP token bucket for the public API.
 *
 * Best-effort only: the state lives in module memory, so on a serverless platform each
 * instance keeps its own counters and the effective limit scales with instance count.
 * That is enough to stop one client hammering the upstream RPC or Binance endpoints,
 * which is the actual risk here. A shared store would be needed for a real quota.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds at which the window resets. */
  resetAt: number;
  retryAfterSeconds: number;
};

type Bucket = { tokens: number; updatedAt: number };

const WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;

const buckets = new Map<string, Bucket>();

/**
 * Trust `x-forwarded-for` only for its first entry, which is the client as seen by the
 * edge. Later entries are proxy-supplied and trivially spoofable.
 */
export function clientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(identifier: string, limitPerMinute: number, now = Date.now()): RateLimitResult {
  // Bound memory: a flood of unique identifiers would otherwise grow the map forever.
  if (buckets.size > MAX_TRACKED_CLIENTS) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt > WINDOW_MS) {
        buckets.delete(key);
      }
    }
  }

  const existing = buckets.get(identifier);
  const elapsed = existing ? now - existing.updatedAt : WINDOW_MS;
  const refilled = Math.min(
    limitPerMinute,
    (existing?.tokens ?? limitPerMinute) + (elapsed / WINDOW_MS) * limitPerMinute,
  );

  const resetAt = Math.ceil((now + WINDOW_MS) / 1000);

  if (refilled < 1) {
    buckets.set(identifier, { tokens: refilled, updatedAt: now });
    const secondsPerToken = 60 / limitPerMinute;
    return {
      allowed: false,
      limit: limitPerMinute,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - refilled) * secondsPerToken)),
    };
  }

  const remaining = refilled - 1;
  buckets.set(identifier, { tokens: remaining, updatedAt: now });

  return { allowed: true, limit: limitPerMinute, remaining: Math.floor(remaining), resetAt, retryAfterSeconds: 0 };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/** Test hook, clears all buckets between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
