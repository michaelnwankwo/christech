// src/lib/currency/fx.ts
// Blueprint §13.3: "Rates are fetched by a scheduled server job" — in a
// Next.js deployment that job is this module, invoked by quote requests with
// a short-lived server cache (and refreshed by /api/jobs/maintenance).
// The browser NEVER supplies rates; it may only display them via /api/fx.

import "server-only";
import { parseManualRates } from "@/lib/currency/money";
import { log } from "@/lib/logging/log";
import { demoEligible } from "@/lib/demo/mode";
import { DEMO_FX_RATES } from "@/lib/demo/data";
import type { Currency } from "@/types/catalog";

export type FxSnapshot = {
  rates: Partial<Record<Currency, number>>;
  provider: string;
  fetchedAtMs: number;
};

let cache: FxSnapshot | null = null;

export class FxUnavailableError extends Error {
  constructor() {
    super("Exchange rates are currently unavailable");
    this.name = "FxUnavailableError";
  }
}

function cacheTtlMs(): number {
  return clampNum(process.env.FX_CACHE_TTL_SECONDS, 300, 30, 3600) * 1000;
}

function maxAgeMs(): number {
  return clampNum(process.env.FX_MAX_AGE_SECONDS, 3600, 60, 86_400) * 1000;
}

function clampNum(
  envValue: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
}

/**
 * Resolve NGN-based rates for USD/GBP/EUR display + charging.
 *
 * Order of preference:
 *   1. fresh cached provider snapshot,
 *   2. live provider fetch (open.er-api.com by default; FX_PROVIDER_BASE_URL
 *      overrides; optional FX_PROVIDER_API_KEY appended as ?access_key=),
 *   3. MANUAL_FX_RATES fallback — REQUIRED for offline/CI determinism;
 *      if absent, throws FxUnavailableError (quotes then fail with 503).
 */
export async function resolveFxRates(forceRefresh = false): Promise<FxSnapshot> {
  const nowMs = Date.now();

  if (
    !forceRefresh &&
    cache &&
    nowMs - cache.fetchedAtMs < cacheTtlMs()
  ) {
    return cache;
  }

  try {
    const snapshot = await fetchFromProvider();
    cache = snapshot;
    return snapshot;
  } catch (error) {
    log.warn("fx.provider_fetch_failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });

    // Serve a stale-but-under-maxage cache before falling back to manual.
    if (cache && nowMs - cache.fetchedAtMs < maxAgeMs()) return cache;

    const manual = parseManualRates(process.env.MANUAL_FX_RATES);
    const complete = (["USD", "GBP", "EUR"] as const).every(
      (code) => typeof manual[code] === "number"
    );
    if (complete) {
      return {
        rates: manual,
        provider: "manual-config",
        fetchedAtMs: nowMs,
      };
    }

    // Offline demo path: built-in static rates keep the UI quotable when
    // there is NO network at all. Gated by the demo policy (dev, or
    // DEMO_FALLBACK=1) — production keeps failing loudly, per test 19.2.
    if (demoEligible()) {
      return {
        rates: { ...DEMO_FX_RATES },
        provider: "demo-builtin",
        fetchedAtMs: nowMs,
      };
    }

    throw new FxUnavailableError();
  }
}

async function fetchFromProvider(): Promise<FxSnapshot> {
  const base =
    process.env.FX_PROVIDER_BASE_URL ?? "https://open.er-api.com/v6";
  const baseCurrency =
    (process.env.FX_PROVIDER_BASE_CURRENCY as Currency) ?? "NGN";
  const apiKey = process.env.FX_PROVIDER_API_KEY;

  const url = new URL(`${base}/latest/${baseCurrency}`);
  if (apiKey) url.searchParams.set("access_key", apiKey);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { accept: "application/json" },
    cache: "no-store",
    next: { revalidate: 0 },
  });

  if (!response.ok) throw new Error(`FX provider responded ${response.status}`);

  const payload = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };

  if (payload.result !== "success" || !payload.rates) {
    throw new Error("FX provider returned an unsuccessful payload");
  }

  const rates: Partial<Record<Currency, number>> = { NGN: 1 };
  for (const code of ["USD", "GBP", "EUR"] as const) {
    const rate = payload.rates[code];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`FX provider missing rate for ${code}`);
    }
    rates[code] = rate;
  }

  return { rates, provider: "fx-provider", fetchedAtMs: Date.now() };
}

/** Test seam. */
export function __resetFxCacheForTests() {
  cache = null;
}
