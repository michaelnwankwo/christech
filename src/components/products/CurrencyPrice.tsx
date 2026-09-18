"use client";

// src/components/products/CurrencyPrice.tsx
// Display snapshot ONLY (§2.2). Falls back to "Price unavailable" when a
// non-NGN currency has no rate loaded yet — never a silently wrong number.

import { useCurrency } from "@/hooks/useCurrency";

export function CurrencyPrice({ amountMinor }: { amountMinor: number }) {
  const { format } = useCurrency();
  return <span className="product-card__price mono">{format(amountMinor)}</span>;
}
