"use client";

// src/app/(storefront)/cart/page.tsx
// Full-page cart view sharing the drawer's line component tree (§10.3).
// Removing a product removes its add-ons — implemented in the STORE, so this
// page can't diverge from the drawer behavior.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useCartStore } from "@/stores/cart-store";
import { CartLineItem } from "@/components/cart/CartLineItem";
import { CartTotals } from "@/components/cart/CartTotals";
import { BrandLoader } from "@/components/ui/BrandLoader";
import { orderLinesForDisplay } from "@/components/cart/CartDrawer";

export default function CartPage() {
  const lines = useCartStore((s) => s.lines);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);

  const [clearPending, startClear] = useTransition();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ordered = mounted ? orderLinesForDisplay(lines) : [];

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Shopping cart
        </h1>
        {lines.length > 0 ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => startClear(clearCart)}
            disabled={clearPending}
            aria-busy={clearPending || undefined}
          >
            {clearPending ? <BrandLoader variant="inline" label="Clearing…" /> : "Empty cart"}
          </button>
        ) : null}
      </div>

      <section className="surface-card" style={{ padding: "1rem" }}>
        {!mounted ? (
          <p className="muted">Restoring your cart…</p>
        ) : lines.length === 0 ? (
          <p>
            Your cart is empty.{" "}
            <Link href="/products">Browse products</Link> — service bookings
            live under <Link href="/services">Book a service</Link>.
          </p>
        ) : (
          <>
            {ordered.map((line) => (
              <CartLineItem
                key={line.lineId}
                line={line}
                onRemove={() => removeLine(line.lineId)}
                onQuantityChange={(quantity) =>
                  updateQuantity(line.lineId, quantity)
                }
              />
            ))}
            <div style={{ marginTop: ".9rem" }}>
              <CartTotals withCheckoutLink />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
