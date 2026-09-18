"use client";

// src/components/cart/CartDrawer.tsx
// Blueprint §10.4 structure + CartTotals. Add-ons render NESTED under their
// parent product (§10.3). Closing: scrim click + Escape (a11y).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/stores/cart-store";
import { useStorefrontStore } from "@/stores/storefront-store";
import { CartLineItem } from "./CartLineItem";
import { CartTotals } from "./CartTotals";

export function CartDrawer() {
  const lines = useCartStore((state) => state.lines);
  const removeLine = useCartStore((state) => state.removeLine);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const open = useStorefrontStore((s) => s.cartOpen);
  const close = useStorefrontStore((s) => s.closeCart);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Render ORDER: parents first, children directly beneath their parent.
  const ordered = mounted ? orderLinesForDisplay(lines) : [];

  return (
    <>
      {open ? (
        <button
          type="button"
          className="cart-scrim"
          aria-label="Close cart"
          onClick={close}
        />
      ) : null}

      <aside
        className="cart-drawer"
        data-open={open}
        aria-label="Shopping cart"
        aria-hidden={!open}
      >
        <div className="cart-drawer__head">
          <strong>Your cart</strong>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={close}
            aria-label="Close cart"
            tabIndex={open ? 0 : -1}
          >
            Close ✕
          </button>
        </div>

        <div className="cart-drawer__body">
          {!mounted || lines.length === 0 ? (
            <p>Your cart is empty.</p>
          ) : (
            ordered.map((line) => (
              <CartLineItem
                key={line.lineId}
                line={line}
                onRemove={() => removeLine(line.lineId)}
                onQuantityChange={(quantity) =>
                  updateQuantity(line.lineId, quantity)
                }
              />
            ))
          )}
        </div>

        <div className="cart-drawer__foot">
          <CartTotals />
          <Link
            href="/checkout"
            className="btn"
            aria-disabled={mounted && lines.length > 0 ? undefined : true}
            onClick={(event) => {
              if (!mounted || lines.length === 0) event.preventDefault();
            }}
          >
            Go to checkout
          </Link>
        </div>
      </aside>
    </>
  );
}

export function orderLinesForDisplay<
  T extends { lineId: string; kind: string; parentLineId?: string }
>(lines: T[]): T[] {
  const byParent = new Map<string | undefined, T[]>();
  for (const line of lines) {
    const key = line.kind === "product" ? undefined : line.parentLineId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(line);
    byParent.set(key, bucket);
  }

  const out: T[] = [];
  for (const product of byParent.get(undefined) ?? []) {
    out.push(product);
    for (const child of byParent.get(product.lineId) ?? []) {
      out.push(child);
    }
  }
  // Orphans (should be impossible; DB would reject them) still surface.
  for (const [key, bucket] of byParent) {
    if (key !== undefined && !lines.some((l) => l.lineId === key)) {
      out.push(...bucket);
    }
  }
  return out;
}
