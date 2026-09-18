// src/lib/payments/currency-adapter.ts
// Blueprint §13.1 — Paystack does not accept GBP/EUR as charge currencies
// (§2.6). This adapter is the ONLY place where the charged currency is
// decided; the charge currency is then FROZEN inside the server quote row.

import type { Currency } from "@/types/catalog";

export const PAYSTACK_SUPPORTED_CURRENCIES: ReadonlySet<Currency> = new Set([
  "NGN",
  "USD",
]);

function enabledCurrencies(): ReadonlySet<Currency> {
  return intersectSupported(
    new Set<Currency>(
      (process.env.PAYSTACK_ENABLED_CURRENCIES ?? "NGN,USD")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value): value is Currency =>
          ["NGN", "USD", "GBP", "EUR"].includes(value)
        )
    )
  );
}

/** Env may only NARROW the list of chargeable currencies; it can never
 *  broaden it past what Paystack accepts (§2.6). A misconfigured
 *  PAYSTACK_ENABLED_CURRENCIES=NGN,GBP must not leak GBP to the processor. */
function intersectSupported(configured: ReadonlySet<Currency>): Set<Currency> {
  const out = new Set<Currency>();
  for (const code of configured) {
    if (PAYSTACK_SUPPORTED_CURRENCIES.has(code)) out.add(code);
  }
  return out;
}

export function resolvePaystackChargeCurrency(
  displayCurrency: Currency
): Currency {
  return resolvePaystackChargeCurrencyWith(enabledCurrencies(), displayCurrency);
}

/** Pure core, injectable for unit tests. Callers must pass a set that is
 *  already intersected with PAYSTACK_SUPPORTED_CURRENCIES (as
 *  resolvePaystackChargeCurrency does); the core additionally guards. */
export function resolvePaystackChargeCurrencyWith(
  configured: ReadonlySet<Currency>,
  displayCurrency: Currency
): Currency {
  const safe = intersectSupported(configured);

  if (safe.has(displayCurrency)) return displayCurrency;

  if (
    (displayCurrency === "GBP" || displayCurrency === "EUR") &&
    safe.has("USD")
  ) {
    return "USD";
  }

  return "NGN";
}

/**
 * Pre-payment disclosure text (§2.6: "the customer is shown the conversion
 * before payment"). Rendered from the QUOTE row, never from client state.
 */
export function buildConversionDisclosure(
  displayCurrency: Currency,
  chargeCurrency: Currency
): string {
  if (displayCurrency === chargeCurrency) {
    return `Your card will be charged in ${chargeCurrency}.`;
  }
  return `Prices shown in ${displayCurrency}; your card will be charged in ${chargeCurrency} at the exchange rate locked into this quote.`;
}
