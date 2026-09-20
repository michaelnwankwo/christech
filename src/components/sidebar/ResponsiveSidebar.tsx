"use client";

// src/components/sidebar/ResponsiveSidebar.tsx
// Storefront filter panel — one component, two presentations:
//   * ≥921px: docked accordion cards beside the grid (footer row included);
//   * ≤920px: a bottom sheet (rounded top corners, slide-up + scrim fade),
//     "Filter" header bar with ✕, scrollable body of section cards, and a
//     sticky footer (Clear all · Apply).
//
// STAGED APPLY: all controls edit the FilterDraftContext — no selection
// touches the URL or router until "Apply" commits the draft as query params
// (and closes the sheet). Closing/discarding keeps the old URL untouched.
// Section order is FIXED: Category → Product Usage → Availability →
// Supported Brands → Price Range (always last, immediately above the
// action buttons). Open state for the sheet itself still lives in
// storefront-store `sidebarOpen`, owned by the products-header FilterPill.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useStorefrontStore } from "@/stores/storefront-store";
import { BrandLoader } from "@/components/ui/BrandLoader";
import {
  AvailabilityFilter,
  BrandFilterList,
  CategoryFilter,
  PriceRangeFilter,
  UsageFilter,
} from "./FilterSections";
import {
  FilterDraftProvider,
  useFilterDraft,
} from "./filter-draft";

export function ResponsiveSidebar(props: {
  categories: string[];
  usageTags: string[];
}) {
  return (
    <FilterDraftProvider>
      <SidebarInner categories={props.categories} usageTags={props.usageTags} />
    </FilterDraftProvider>
  );
}

function SidebarInner({
  categories,
  usageTags,
}: {
  categories: string[];
  usageTags: string[];
}) {
  type SheetSection = "category" | "usage" | "availability" | "brands" | "price";

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
  const { commit, clearDraft, isEmpty, activeCount, isCommitPending } =
    useFilterDraft();

  // Collapse whenever the route changes (e.g. /products → /cart) so the
  // sheet can never float onto unrelated pages.
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

  // Escape dismisses the sheet (draft discarded by the provider's re-sync).
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
            <CategoryFilter categories={categories} />
          </FilterSection>

          <FilterSection
            id="usage"
            title="Product Usage"
            open={openSections.usage}
            onToggle={() => toggleSection("usage")}
          >
            <UsageFilter usageTags={usageTags} />
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
            <BrandFilterList />
          </FilterSection>

          <FilterSection
            id="price"
            title="Price Range (NGN)"
            open={openSections.price}
            onToggle={() => toggleSection("price")}
          >
            <PriceRangeFilter />
          </FilterSection>
        </div>

        <div className="filter-sheet__footer">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={clearDraft}
            disabled={isEmpty}
          >
            Clear all
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={commit}
            disabled={isCommitPending}
            aria-busy={isCommitPending || undefined}
          >
            {isCommitPending ? (
              <BrandLoader variant="inline" label="" />
            ) : (
              <>
                Apply
                {activeCount > 0 ? ` · ${activeCount}` : ""}
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * One accordion card: header row (title left, chevron far right) over a
 * padded content panel. The BUTTON carries the aria ids — the §19.4
 * dangling-label convention from the original blueprint sketch is kept.
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
          <span className="filter-card__title">{title}</span>
          <span
            aria-hidden="true"
            className={`sidebar__glyph${open ? " sidebar__glyph--open" : ""}`}
          >
            ›
          </span>
        </button>
      </h3>

      <div
        id={panelId}
        className="filter-card__panel"
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
