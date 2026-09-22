"use client";

// src/components/cart/CartDrawer.tsx
// Blueprint §10.4 structure + CartTotals. Add-ons render NESTED under their
// parent product (§10.3). Closing: scrim click + Escape (a11y).

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cart-store";
import { useStorefrontStore } from "@/stores/storefront-store";
import { CartLineItem } from "./CartLineItem";
import { CartTotals } from "./CartTotals";
import { BrandLoader } from "@/components/ui/BrandLoader";

export function CartDrawer() {
  const lines = useCartStore((state) => state.lines);
  const removeLine = useCartStore((state) => state.removeLine);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);
  const open = useStorefrontStore((s) => s.cartOpen);
  const close = useStorefrontStore((s) => s.closeCart);

  const router = useRouter();
  // Checkout nav is a REAL server round-trip (the /checkout RSC payload);
  // clearing the cart is a local store mutation. Both are wrapped the same
  // way: the branded spinner is driven by React's own pending state, so the
  // local one simply resolves within a frame instead of faking a delay.
  const [navPending, startNav] = useTransition();
  const [clearPending, startClear] = useTransition();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const goToCheckout = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!mounted || lines.length === 0) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      startNav(() => router.push("/checkout"));
    },
    [mounted, lines.length, router, startNav]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Scroll-lock the page behind the sheet (same pattern as the filter
  // sidebar) so scrolling inside the cart can never drag the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Render ORDER: parents first, children directly beneath their parent.
  const ordered = mounted ? orderLinesForDisplay(lines) : [];
  // Header count = units of PRODUCT lines; add-ons ride along with their
  // parent line and would double-count if added here.
  const itemCount = mounted
    ? lines
        .filter((line) => line.kind === "product")
        .reduce((total, line) => total + line.quantity, 0)
    : 0;

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
          <div className="cart-drawer__head-title">
            <strong>Your cart</strong>
            {mounted && itemCount > 0 ? (
              <span className="chip">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="cart-drawer__head-actions">
            {mounted && lines.length > 0 ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => startClear(clearCart)}
                aria-label="Remove all items from cart"
                disabled={clearPending}
                aria-busy={clearPending || undefined}
              >
                {clearPending ? <BrandLoader variant="inline" label="" /> : "Clear"}
              </button>
            ) : null}
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
        </div>

        <div className="cart-drawer__body">
          {!mounted ? null : lines.length === 0 ? (
            <p className="cart-drawer__empty">
              Your cart is empty. Add something from the catalog and it will
              show up here.
            </p>
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
          {/* The shipping/conversion micro-copy belongs to the checkout
              footers (cart page + CartReview), not the compact drawer. */}
          <CartTotals showShippingNote={false} />
          <Link
            href="/checkout"
            className="btn cart-drawer__checkout"
            aria-disabled={mounted && lines.length > 0 ? undefined : true}
            onClick={goToCheckout}
            aria-busy={navPending || undefined}
          >
            {navPending ? <BrandLoader variant="inline" label="Opening checkout…" /> : "Go to checkout"}
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
