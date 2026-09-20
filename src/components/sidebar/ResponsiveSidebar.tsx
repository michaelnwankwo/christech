"use client";

// src/components/sidebar/ResponsiveSidebar.tsx
// Storefront filter panel — one component, two presentations:
//   * ≥921px: docked accordion card beside the grid (unchanged contract);
//   * ≤920px: a bottom sheet (rounded top corners, slide-up + scrim fade),
//     "Filter" header bar with ✕, scrollable body of section cards, and a
//     sticky footer (Clear all · Show results).
// Open state lives in storefront-store `sidebarOpen` (§7.1) — the products
// header's FilterPill owns the same flag. Body scroll locks while the sheet
// is open (mobile only); Escape and scrim taps dismiss.
//
// Section order is FIXED by product spec: Category → Product Usage →
// Availability → Supported Brands → Price Range (always last). The old
// "Live Order Tracking & Recent Transactions" widgets were purged from the
// storefront — realtime order UI belongs to /account only (the
// useOrderRealtime hook stays for OrderTimeline).

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStorefrontStore } from "@/stores/storefront-store";
import {
  AvailabilityFilter,
  BRAND_OPTIONS,
  BrandFilterList,
  CategoryFilter,
  PriceRangeFilter,
  UsageFilter,
  countActiveFilters,
} from "./FilterSections";

type SheetSection = "category" | "usage" | "availability" | "brands" | "price";

export function ResponsiveSidebar(props: {
  categories: string[];
  usageTags: string[];
}) {
  const [openSections, setOpenSections] = useState<
    Record<SheetSection, boolean>
  >({
    category: true,
    usage: true,
    availability: true,
    brands: true,
    price: true,
  });

  const sidebarOpen = useStorefrontStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStorefrontStore((s) => s.setSidebarOpen);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Collapse whenever the route changes (e.g. /products → /cart) so the
  // sheet can never float onto unrelated pages. Query-param updates keep
  // the same pathname, so applying filters inside the sheet keeps it open.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Scroll-lock the body while the sheet is open — mobile presentation only;
  // the docked desktop sidebar must never freeze the page.
  useEffect(() => {
    if (!sidebarOpen || typeof document === "undefined") return;
    if (!window.matchMedia("(max-width: 920px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  // Escape dismisses the sheet.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, setSidebarOpen]);

  function toggleSection(section: SheetSection) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  const activeCount = countActiveFilters(searchParams);

  return (
    <>
      <div
        className="filter-sheet__scrim"
        data-open={sidebarOpen ? "true" : "false"}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className="sidebar surface-card sidebar__panel"
        id="store-filters"
        data-open={sidebarOpen ? "true" : "false"}
        aria-label="Store filters"
      >
        <div className="filter-sheet__bar">
          <h2>Filter</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close filters"
            onClick={() => setSidebarOpen(false)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="filter-sheet__body" id="filter-sheet-body">
          <FilterSection
            id="category"
            title="Category"
            open={openSections.category}
            onToggle={() => toggleSection("category")}
          >
            <CategoryFilter categories={props.categories} />
          </FilterSection>

          <FilterSection
            id="usage"
            title="Product Usage"
            open={openSections.usage}
            onToggle={() => toggleSection("usage")}
          >
            <UsageFilter usageTags={props.usageTags} />
          </FilterSection>

          <FilterSection
            id="availability"
            title="Availability"
            open={openSections.availability}
            onToggle={() => toggleSection("availability")}
          >
            <AvailabilityFilter />
          </FilterSection>

          <FilterSection
            id="brands"
            title="Supported Brands"
            open={openSections.brands}
            onToggle={() => toggleSection("brands")}
          >
            <BrandFilterList brands={BRAND_OPTIONS} />
          </FilterSection>

          <FilterSection
            id="price"
            title="Price Range (NGN)"
            open={openSections.price}
            onToggle={() => toggleSection("price")}
          >
            <PriceRangeFilter />
          </FilterSection>

          <div className="sidebar__actions sidebar__actions--docked">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => router.push(pathname, { scroll: false })}
            >
              Reset all filters
            </button>
          </div>
        </div>

        <div className="filter-sheet__footer">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={activeCount === 0}
            onClick={() => router.push(pathname, { scroll: false })}
          >
            Clear all
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setSidebarOpen(false)}
          >
            Show results{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * One accordion card: header row with chevron (› rotates when open) and a
 * collapsible panel. The BUTTON carries the aria-controls/labelledby ids —
 * the §19.4 dangling-label fix from the original blueprint sketch is kept.
 */
function FilterSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `filter-${id}-panel`;
  const buttonId = `filter-${id}-button`;

  return (
    <section className="filter-card">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span
            aria-hidden="true"
            className={`sidebar__glyph${open ? " sidebar__glyph--open" : ""}`}
          >
            ›
          </span>
        </button>
      </h3>

      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
