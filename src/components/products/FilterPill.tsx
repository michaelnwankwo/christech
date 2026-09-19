"use client";

// src/components/products/FilterPill.tsx
// Option B header integration: a compact pill in the products header that
// toggles the stacked sidebar via the storefront store (§7.1 already owns
// sidebarOpen — this is the control it was reserved for). Replaces the
// full-width "Filter Options" text trigger; on desktop (where the sidebar is
// docked permanently) the pill hides itself via CSS.

import { useStorefrontStore } from "@/stores/storefront-store";

export function FilterPill({ activeCount = 0 }: { activeCount?: number }) {
  const open = useStorefrontStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStorefrontStore((s) => s.setSidebarOpen);

  // The sheet animates itself in (fixed overlay), so there is nothing to
  // scroll into view here — the store flag IS the whole contract.
  return (
    <button
      type="button"
      className={`filter-pill${open ? " filter-pill--on" : ""}`}
      aria-expanded={open}
      aria-controls="store-filters"
      onClick={() => setSidebarOpen(!open)}
    >
      <span aria-hidden="true">🎛️</span>
      <span>Filter</span>
      {activeCount > 0 ? (
        <span className="filter-pill__count" aria-label={`${activeCount} active filters`}>
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}
