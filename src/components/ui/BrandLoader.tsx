// src/components/ui/BrandLoader.tsx
// One loading language for the whole storefront: the brand mark ("CV"
// initials tile) with a rotating accent ring + pulsing halo, reused in three
// densities:
//   full     — fixed backdrop overlay for route transitions / checkout nav
//   inline   — compact spinner for buttons and section updates (em-sized, so
//              it scales inside .btn / .btn--sm without per-site CSS)
//   skeleton — branded placeholder grid. It reuses the REAL .product-grid
//              class (2/3/4 responsive tiers) with fixed-aspect tiles, so
//              swapping in the loaded grid cannot shift layout.
// All motion is transform/opacity-only (compositor-friendly) and every
// animation is disabled under prefers-reduced-motion (see globals.css), where
// the mark degrades to a static logo.
//
// Deliberately free of "use client": it renders inside server loading.tsx
// boundaries AND inside client components alike.

export type BrandLoaderVariant = "full" | "inline" | "skeleton";

type BrandLoaderProps = {
  variant?: BrandLoaderVariant;
  /** Visible text. Pass "" to render a mark-only spinner. */
  label?: string;
  /** Skeleton variant only: number of placeholder cards (clamped 1–12). */
  count?: number;
};

function BrandMark() {
  return (
    <span className="brand-loader__mark" aria-hidden="true">
      <span className="brand-loader__halo" />
      <span className="brand-loader__ring" />
      <b className="brand-loader__initials">CV</b>
    </span>
  );
}

export function BrandLoader(props: BrandLoaderProps) {
  const { variant = "inline", label, count = 8 } = props;

  if (variant === "full") {
    return (
      <div className="brand-loader brand-loader--full" role="status">
        <div className="brand-loader__stack">
          <BrandMark />
          <p className="brand-loader__label">{label ?? "Loading Christech…"}</p>
        </div>
      </div>
    );
  }

  if (variant === "skeleton") {
    const cards = Array.from(
      { length: Math.min(12, Math.max(1, Math.trunc(count))) },
      (_, index) => index
    );
    return (
      <div
        className="brand-loader brand-loader--skeleton"
        role="status"
        aria-label="Loading products"
      >
        <div className="product-grid">
          {cards.map((index) => (
            <div className="brand-skeleton-card" key={index}>
              <span className="brand-skeleton__thumb" />
              <span className="brand-skeleton__line" style={{ width: "78%" }} />
              <span className="brand-skeleton__line" style={{ width: "52%" }} />
              <span className="brand-skeleton__foot">
                <span className="brand-skeleton__price" />
                <span className="brand-skeleton__btn" />
              </span>
            </div>
          ))}
        </div>
        <span className="visually-hidden">Loading products…</span>
      </div>
    );
  }

  // inline — used bare inside buttons (label ""), or with text elsewhere.
  return (
    <span className="brand-loader brand-loader--inline" role="status">
      <BrandMark />
      {label ? <span className="brand-loader__label">{label}</span> : null}
      {!label ? <span className="visually-hidden">Loading…</span> : null}
    </span>
  );
}
