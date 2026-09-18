"use client";

import { useCurrency } from "@/hooks/useCurrency";
import type { CartLine } from "@/stores/cart-store";

// src/components/cart/CartLineItem.tsx
// Cart lines are display snapshots ("does not store authoritative pricing"
// — §10.3): the removal/quantity handlers mutate the store, and the NEXT
// server quote is what the customer actually pays.

export function CartLineItem(props: {
  line: CartLine;
  onRemove: () => void;
  onQuantityChange: (quantity: number) => void;
}) {
  const { line, onRemove, onQuantityChange } = props;
  const { format } = useCurrency();
  const isAddon = line.kind === "service_addon";

  return (
    <div className={`cart-line${isAddon ? " cart-line--child" : ""}`}>
      <div className="cart-line__main">
        <p className="cart-line__name">
          {isAddon ? "↳ " : ""}
          {line.name}
        </p>
        <p className="cart-line__price mono">
          {format(line.baseUnitMinor)} {line.sku ? `· ${line.sku}` : ""}
        </p>
        <div className="row" style={{ gap: ".35rem" }}>
          {isAddon ? null : (
            <span className="qty-stepper">
              <button
                type="button"
                aria-label={`Decrease quantity of ${line.name}`}
                onClick={() => onQuantityChange(line.quantity - 1)}
              >
                −
              </button>
              <span aria-live="polite">{line.quantity}</span>
              <button
                type="button"
                aria-label={`Increase quantity of ${line.name}`}
                onClick={() => onQuantityChange(line.quantity + 1)}
              >
                +
              </button>
            </span>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onRemove}
            aria-label={`Remove ${line.name}${
              isAddon ? "" : " and its attached add-ons"
            }`}
          >
            Remove
          </button>
        </div>
      </div>
      <strong className="mono">{format(line.baseUnitMinor * line.quantity)}</strong>
    </div>
  );
}
