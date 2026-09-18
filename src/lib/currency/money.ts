// src/lib/currency/money.ts
// All money math in minor units. The browser only ever uses these for
// DISPLAY; checkout totals come from the server quote (§2.2, §13).

import type { Currency } from "@/types/catalog";

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
};

/** §13.2 — exact formatter from the blueprint. */
export function formatMinorMoney(
  amountMinor: number,
  currency: Currency,
  locale = LOCALE_BY_CURRENCY[currency] ?? "en-NG"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/**
 * Convert NGN minor units into display minor units.
 *
 * Contract (test 19.2 "missing rates do not silently use a rate of one"):
 *   - NGN is the identity conversion (rate is structurally 1),
 *   - ANY other currency without a known rate returns null — the caller must
 *     show "price unavailable" rather than a wrong number,
 *   - rounding is half-up to whole minor units.
 */
export function convertBaseToDisplay(
  amountBaseMinor: number,
  currency: Currency,
  rates: Partial<Record<Currency, number>>
): number | null {
  if (currency === "NGN") return amountBaseMinor;

  const rate = rates[currency];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;

  return Math.round(amountBaseMinor * rate);
}

/**
 * Parse the MANUAL_FX_RATES fallback: "USD=0.00065;GBP=0.00051;EUR=0.0006".
 * Malformed entries are dropped (and the fetch layer logs the omission) —
 * a broken fallback must never invent a rate.
 */
export function parseManualRates(
  raw: string | undefined
): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = { NGN: 1 };
  if (!raw) return out;

  for (const pair of raw.split(/[;,]/)) {
    const [code, value] = pair.split("=").map((s) => s.trim());
    if (!code || !value) continue;
    if (!["NGN", "USD", "GBP", "EUR"].includes(code)) continue;
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) {
      out[code as Currency] = rate;
    }
  }
  return out;
}
