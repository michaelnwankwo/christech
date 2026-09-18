"use client";

// src/components/layout/CurrencyPicker.tsx
// Display-currency selector (persisted in the cart store). Changing it
// clears any cached shipping quote INSIDE the store action — invalidation
// lives in the store so no UI path can forget it (§21.1 #7).

import { useCurrency } from "@/hooks/useCurrency";
import type { Currency } from "@/stores/cart-store";

export function CurrencyPicker() {
  const { currency, currencies, setCurrency } = useCurrency();

  return (
    <label className="row" style={{ gap: ".35rem" }}>
      <span className="visually-hidden">Display currency</span>
      <select
        value={currency}
        onChange={(event) => setCurrency(event.target.value as Currency)}
        aria-label="Display currency"
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: ".5rem",
          padding: ".3rem .45rem",
          font: "inherit",
          fontSize: ".85rem",
          background: "var(--color-surface)",
          color: "var(--color-text)",
        }}
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
