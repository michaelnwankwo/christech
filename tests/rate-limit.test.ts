// tests/rate-limit.test.ts — §18.4 token bucket behavior.
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  RATE_LIMIT_RULES,
  __resetRateLimitsForTests,
} from "@/lib/security/rate-limit";

beforeEach(() => __resetRateLimitsForTests());

describe("token bucket", () => {
  it("allows the configured burst, then denies with a sane Retry-After", () => {
    const rule = RATE_LIMIT_RULES["service-requests"];
    const t0 = 1_000_000;

    for (let i = 0; i < rule.limit; i++) {
      expect(checkRateLimit("service-requests", "user-1", t0).ok).toBe(true);
    }

    const denial = checkRateLimit("service-requests", "user-1", t0);
    expect(denial.ok).toBe(false);
    if (!denial.ok) {
      expect(denial.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(denial.retryAfterSeconds).toBeLessThanOrEqual(rule.windowSeconds);
    }
  });

  it("refills over time", () => {
    const rule = RATE_LIMIT_RULES["checkout/initialize"];
    const t0 = 2_000_000;
    for (let i = 0; i < rule.limit; i++) {
      checkRateLimit("checkout/initialize", "user-2", t0);
    }
    expect(checkRateLimit("checkout/initialize", "user-2", t0).ok).toBe(false);

    // Full window later, a request fits again.
    const later = t0 + rule.windowSeconds * 1000;
    expect(checkRateLimit("checkout/initialize", "user-2", later).ok).toBe(true);
  });

  it("keys are per-route and per-caller", () => {
    const t0 = 3_000_000;
    const rule = RATE_LIMIT_RULES["payments/verify"];
    for (let i = 0; i < rule.limit; i++) {
      checkRateLimit("payments/verify", "mallory", t0);
    }
    expect(checkRateLimit("payments/verify", "mallory", t0).ok).toBe(false);
    expect(checkRateLimit("payments/verify", "bob", t0).ok).toBe(true);
    expect(checkRateLimit("service-requests", "mallory", t0).ok).toBe(true);
  });
});
