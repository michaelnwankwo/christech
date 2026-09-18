"use client";

// src/components/cart/CartTotals.tsx
// Until a SERVER quote exists, shipping reads "Calculate after address"
// (§10.3). The grand total switches to the quote's authoritative figure the
// moment one is present, with the charge-currency disclosure under it.
//
// Conversion accounting (audit note): `cartSubtotalDisplayMinor` ALREADY
// produces display-currency minor units; these are formatted with
// formatMinorMoney directly — passing them through the base→display helper
// again would double-convert.

import Link from "next/link";
import { useCartStore, cartSubtotalDisplayMinor } from "@/stores/cart-store";
import { formatMinorMoney } from "@/lib/currency/money";

export function CartTotals({ withCheckoutLink = false }: { withCheckoutLink?: boolean }) {
  const lines = useCartStore((s) => s.lines);
  const displayCurrency = useCartStore((s) => s.displayCurrency);
  const fxRates = useCartStore((s) => s.fxRates);
  const quote = useCartStore((s) => s.quote);

  const subtotalDisplay = cartSubtotalDisplayMinor({
    lines,
    displayCurrency,
    fxRates,
  });

  if (lines.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing in the cart yet.</p>;
  }

  const shippingDisplay = quote
    ? formatMinorMoney(quote.shippingDisplayMinor, quote.displayCurrency)
    : "Calculate after address";

  const grandTotal = quote
    ? formatMinorMoney(quote.totalDisplayMinor, quote.displayCurrency)
    : subtotalDisplay === null
      ? "Price unavailable"
      : formatMinorMoney(subtotalDisplay, displayCurrency);

  return (
    <div className="cart-totals">
      <div className="row">
        <span>Subtotal</span>
        <span className="mono">
          {subtotalDisplay === null
            ? "Price unavailable"
            : formatMinorMoney(subtotalDisplay, displayCurrency)}
        </span>
      </div>
      <div className="row">
        <span>Shipping</span>
        <span className="muted">{shippingDisplay}</span>
      </div>
      {!quote ? (
        <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
          Shipping and currency conversion are confirmed on checkout.
        </p>
      ) : null}
      <div className="row" style={{ fontWeight: 800, fontSize: "1rem" }}>
        <span>Total</span>
        <span className="mono">{grandTotal}</span>
      </div>
      {quote ? (
        <p className="muted" style={{ margin: 0, fontSize: ".76rem" }}>
          {quote.conversionDisclosure}
        </p>
      ) : null}
      {withCheckoutLink ? (
        <Link href="/checkout" className="btn">
          Review &amp; pay
        </Link>
      ) : null}
    </div>
  );
}
