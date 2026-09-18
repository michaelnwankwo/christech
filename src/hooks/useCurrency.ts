"use client";

// src/hooks/useCurrency.ts
// Display-currency plumbing: reads the persisted preference, refreshes FX
// rates from the server (public /api/fx — display ONLY), and exposes a
// formatter. Missing rates render as "—" never as a wrong number (§19.2).

import { useCallback, useEffect } from "react";
import { useCartStore, CURRENCIES, type Currency } from "@/stores/cart-store";
import {
  convertBaseToDisplay,
  formatMinorMoney,
} from "@/lib/currency/money";

export function useCurrency() {
  const displayCurrency = useCartStore((s) => s.displayCurrency);
  const fxRates = useCartStore((s) => s.fxRates);
  const setDisplayCurrency = useCartStore((s) => s.setDisplayCurrency);
  const setRates = useCartStore((s) => s.setRates);

  // One refresh per mount when a non-NGN currency is selected without rates.
  useEffect(() => {
    if (displayCurrency === "NGN") return;
    if (typeof fxRates[displayCurrency] === "number") return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/fx", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          rates: Partial<Record<Currency, number>>;
        };
        if (!cancelled) setRates({ ...payload.rates, NGN: 1 });
      } catch {
        // Display-only concern: prices will show "price unavailable".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [displayCurrency, fxRates, setRates]);

  const format = useCallback(
    (amountBaseMinor: number): string => {
      const converted = convertBaseToDisplay(
        amountBaseMinor,
        displayCurrency,
        fxRates
      );
      if (converted === null) return "Price unavailable";
      return formatMinorMoney(converted, displayCurrency);
    },
    [displayCurrency, fxRates]
  );

  return {
    currency: displayCurrency,
    currencies: CURRENCIES,
    setCurrency: setDisplayCurrency,
    rates: fxRates,
    format,
  };
}
