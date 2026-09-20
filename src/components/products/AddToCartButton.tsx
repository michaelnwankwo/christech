"use client";

// src/components/products/AddToCartButton.tsx
// Adds a product line plus any CHECKED add-on lines (§2.3). Add-on ids come
// from server-provided catalog data filtered to kind='add_on' upstream —
// booking services are structurally absent from this list.
//
// lineId scheme: one random uuid per line (clientLineId). The server
// rebuilds everything from productId/serviceId/quantity — the client id only
// wires parents to children (§17.1).

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCartStore, type CartLine } from "@/stores/cart-store";
import { useStorefrontStore } from "@/stores/storefront-store";
import { BrandLoader } from "@/components/ui/BrandLoader";

type Addon = {
  id: string;
  name: string;
  basePriceMinor: number;
  durationMinutes: number | null;
};

type ProductSeed = {
  id: string;
  name: string;
  sku: string;
  unitPriceMinor: number;
  shippingClass: string;
  disabled?: boolean;
};

export function newLineId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function AddToCartButton(props: {
  product: ProductSeed;
  addons?: Addon[];
  /** When true, renders the inline add-on checkboxes (detail page). */
  withAddonPicker?: boolean;
}) {
  const addProduct = useCartStore((s) => s.addProduct);
  const addServiceAddon = useCartStore((s) => s.addServiceAddon);
  const openCart = useStorefrontStore((s) => s.openCart);

  const [pending, startAdd] = useTransition();
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);

  // On grid cards the feedback renders as an absolutely positioned overlay
  // (.atc--floating) so it never changes card height; it self-dismisses so
  // the overlay does not sit on the card forever.
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const toggleAddon = useCallback((id: string) => {
    setSelectedAddons((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function addToCart(quantity = 1) {
    const productLine: CartLine = {
      lineId: newLineId(),
      kind: "product",
      productId: props.product.id,
      name: props.product.name,
      sku: props.product.sku,
      quantity,
      baseUnitMinor: props.product.unitPriceMinor,
      baseCurrency: "NGN",
      isShippable: true,
      shippingClass: props.product.shippingClass,
    };

    addProduct(productLine);

    // Attach checked add-ons as CHILD lines of THIS product line.
    const addons = (props.addons ?? []).filter((a) => selectedAddons.has(a.id));
    let orphan = false;
    for (const addon of addons) {
      const ok = addServiceAddon(
        {
          lineId: newLineId(),
          kind: "service_addon",
          serviceId: addon.id,
          name: addon.name,
          quantity,
          baseUnitMinor: addon.basePriceMinor,
          baseCurrency: "NGN",
          isShippable: false,
        },
        productLine.lineId
      );
      // A false here means the parent vanished mid-interaction; the DB guard
      // (0005 add-on parent validation) is the hard backstop.
      if (!ok) orphan = true;
    }

    setFeedback(
      addons.length > 0
        ? orphan
          ? "Product added; an add-on could not attach — open the cart to retry."
          : `Added ${props.product.name} +${addons.length} service add-on${addons.length > 1 ? "s" : ""}`
        : `Added ${props.product.name}`
    );

    openCart();
  }

  return (
    <span
      className={
        props.withAddonPicker ? "stack atc" : "stack atc atc--floating"
      }
      style={{ gap: ".45rem", width: "100%" }}
    >
      {props.withAddonPicker && props.addons && props.addons.length > 0 ? (
        <fieldset className="addon-list" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="muted" style={{ fontSize: ".8rem", fontWeight: 600 }}>
            Optional service add-ons
          </legend>
          {props.addons.map((addon) => (
            <label key={addon.id}>
              <span className="row" style={{ gap: ".45rem" }}>
                <input
                  type="checkbox"
                  checked={selectedAddons.has(addon.id)}
                  onChange={() => toggleAddon(addon.id)}
                  name={`addon-${addon.id}`}
                />
                <span>{addon.name}</span>
              </span>
              <span className="addon-price">
                +
                {new Intl.NumberFormat("en-NG", {
                  style: "currency",
                  currency: "NGN",
                  maximumFractionDigits: 0,
                }).format(addon.basePriceMinor / 100)}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <button
        type="button"
        className="btn btn--sm"
        disabled={props.product.disabled || pending}
        onClick={() => startAdd(() => addToCart(1))}
        aria-busy={pending || undefined}
      >
        {props.product.disabled
          ? "Out of stock"
          : pending
            ? <BrandLoader variant="inline" label="Adding…" />
            : "Add to cart"}
      </button>
      {feedback ? (
        <span role="status" className="atc__feedback">
          {feedback}
        </span>
      ) : null}
    </span>
  );
}
