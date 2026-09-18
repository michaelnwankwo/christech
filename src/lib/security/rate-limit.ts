// src/lib/security/rate-limit.ts
// Blueprint §18.4 abuse prevention. Single-instance token bucket — correct
// for one app replica and trivially upgradeable to Redis/Upstash: swap the
// store behind `checkRateLimit` without touching any route.
//
// Design notes:
// - Buckets are per (route, client-key). Authenticated users key on their
//   id; anonymous callers key on the (proxy-resolved) IP.
// - Fail-CLOSED with a 429 when a bucket is exhausted (payment endpoints
//   protect money movement; a rate-limit outage should not open the door).
// - Sweeping keeps the map bounded under adversarial key churn.

type Bucket = { tokens: number; updatedAtMs: number };

const store = new Map<string, Bucket>();
let lastSweepMs = 0;

const SWEEP_INTERVAL_MS = 60_000;

export type RateLimitRule = {
  /** Sustained requests per window for one caller. */
  limit: number;
  windowSeconds: number;
  /** Immediate burst allowance (bucket capacity = limit). */
};

export const RATE_LIMIT_RULES = {
  "checkout/quote": { limit: 20, windowSeconds: 60 },
  "checkout/initialize": { limit: 8, windowSeconds: 60 },
  "payments/verify": { limit: 12, windowSeconds: 60 },
  "service-requests": { limit: 6, windowSeconds: 300 },
  "webhooks/paystack": { limit: 240, windowSeconds: 60 },
  fx: { limit: 60, windowSeconds: 60 },
  maintenance: { limit: 2, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(
  route: keyof typeof RATE_LIMIT_RULES,
  callerKey: string,
  nowMs: number = Date.now()
): RateLimitResult {
  const rule = RATE_LIMIT_RULES[route];
  const refillPerMs = rule.limit / (rule.windowSeconds * 1000);
  const key = `${route}:${callerKey}`;

  const previous = store.get(key);
  const elapsedMs = previous ? nowMs - previous.updatedAtMs : 0;
  const tokens = Math.min(
    rule.limit,
    (previous ? previous.tokens : rule.limit) + elapsedMs * refillPerMs
  );

  if (tokens < 1) {
    const needed = 1 - tokens;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(needed / refillPerMs / 1000)),
    };
  }

  store.set(key, { tokens: tokens - 1, updatedAtMs: nowMs });
  sweepIfStale(nowMs);
  return { ok: true, remaining: Math.floor(tokens - 1) };
}

function sweepIfStale(nowMs: number) {
  if (nowMs - lastSweepMs < SWEEP_INTERVAL_MS) return;
  lastSweepMs = nowMs;
  for (const [key, bucket] of store) {
    const fullyRefilled =
      bucket.tokens +
      (nowMs - bucket.updatedAtMs) *
        (RATE_LIMIT_RULES[key.split(":")[0] as keyof typeof RATE_LIMIT_RULES]
          ?.limit ?? 10) /
        60_000 >=
      (RATE_LIMIT_RULES[key.split(":")[0] as keyof typeof RATE_LIMIT_RULES]
        ?.limit ?? 10);
    if (fullyRefilled) store.delete(key);
  }
}

/** Test seam: wipe buckets between cases. */
export function __resetRateLimitsForTests() {
  store.clear();
  lastSweepMs = 0;
}
