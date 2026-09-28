import Link from "next/link";
import type { ProductCard } from "@/types/catalog";
import { AddToCartButton } from "./AddToCartButton";
import { CurrencyPrice } from "./CurrencyPrice";

// src/components/products/ProductGrid.tsx
// Server-rendered grid (§10.1). Prices arrive as NGN base values; the
// client CurrencyPrice wrapper converts for display (server HTML shows the
// authoritative base, then upgrades client-side — no wrong-number flash).

export function ProductGrid({ cards }: { cards: ProductCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="muted" role="status">
        No products match the current filters. Try clearing one.
      </p>
    );
  }

  return (
    <div className="product-grid" data-component="product-grid">
      {cards.map((card) => (
        <article key={card.id} className="product-card surface-card">
          <Link
            href={`/products/${card.slug}`}
            className="product-card__thumb"
            aria-label={`View ${card.name}`}
          >
            {card.imageUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrls[0]}
                alt=""
                className="product-card__img"
              />
            ) : (
              <span>{card.brand}</span>
            )}
          </Link>

          <div className="product-card__body">
            <h3 className="product-card__name">
              <Link href={`/products/${card.slug}`}>{card.name}</Link>
            </h3>
            <div className="product-card__meta">
              <span className="chip">{card.brand}</span>
              <span className="chip">{card.category}</span>
              {card.inventoryQty > 0 ? (
                <span className="chip chip--success">In stock</span>
              ) : (
                <span className="chip chip--danger">Out of stock</span>
              )}
            </div>
            <div className="product-card__foot">
              <CurrencyPrice amountMinor={card.unitPriceMinor} />
              <AddToCartButton
                product={{
                  id: card.id,
                  name: card.name,
                  sku: card.sku,
                  unitPriceMinor: card.unitPriceMinor,
                  shippingClass: "standard",
                  imageUrl: card.imageUrls[0],
                  disabled: card.inventoryQty <= 0,
                }}
                addons={card.addonServices.map((a) => ({
                  ...a,
                  durationMinutes: null,
                }))}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
