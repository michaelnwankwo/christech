"use client";

// src/components/checkout/CartReview.tsx
// Read-only review of cart lines during checkout. Editing stays in the cart
// so a single mutation path exists (the store).

import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import { useCurrency } from "@/hooks/useCurrency";
import { formatMinorMoney } from "@/lib/currency/money";
import { CartTotals } from "@/components/cart/CartTotals";

export function CartReview() {
  const lines = useCartStore((s) => s.lines);
  const quote = useCartStore((s) => s.quote);
  const displayCurrency = useCartStore((s) => s.displayCurrency);
  const { format } = useCurrency();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted || lines.length === 0) return null;

  return (
    <div className="checkout-panel surface-card">
      <h2 style={{ margin: 0 }}>Order contents</h2>
      {lines.map((line) => (
        <div key={line.lineId} className="row" style={{ justifyContent: "space-between" }}>
          <span>
            {line.kind === "service_addon" ? "↳ " : ""}
            {line.name} × {line.quantity}
          </span>
          <span className="mono muted">
            {format(line.baseUnitMinor * line.quantity)}
          </span>
        </div>
      ))}
      {quote ? (
        <p className="muted" style={{ margin: ".4rem 0 0", fontSize: ".8rem" }}>
          Charges in {quote.chargeCurrency}; totals below are the server
          quote.
        </p>
      ) : null}
      <div style={{ marginTop: ".6rem" }}>
        <CartTotals />
      </div>
      <p className="muted" style={{ fontSize: ".76rem", margin: 0 }}>
        Display currency: {displayCurrency}
      </p>
      <span className="visually-hidden">{formatMinorMoney(0, "NGN")}</span>
    </div>
  );
}
