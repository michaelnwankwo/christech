"use client";

// src/components/layout/CartTrigger.tsx
// Opens the cart drawer; badge counts PRODUCT lines (hydrated lazily from
// the persisted store — no SSR/CSR mismatch because the badge renders after
// rehydrate). Booking-mode data is unreachable from here by design.

import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import { useStorefrontStore } from "@/stores/storefront-store";

export function CartTrigger() {
  const lines = useCartStore((s) => s.lines);
  const toggleCart = useStorefrontStore((s) => s.toggleCart);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const count = mounted
    ? lines.filter((line) => line.kind === "product").length
    : 0;

  return (
    <button
      type="button"
      className="btn btn--secondary btn--sm"
      onClick={toggleCart}
      aria-label={`Open cart — ${count} item${count === 1 ? "" : "s"}`}
      style={{ position: "relative" }}
    >
      <span aria-hidden="true">🛒</span>
      <span>Cart</span>
      {count > 0 ? (
        <span className="cart-badge-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
