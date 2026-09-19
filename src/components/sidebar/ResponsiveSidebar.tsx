"use client";

// src/components/sidebar/ResponsiveSidebar.tsx
// Blueprint §9.2 — independent accordion sections. Draft-2 corrections vs
// the spec sketch (both are §19.4 test items):
//   * the section BUTTON carries the id that aria-labelledby references
//     (the sketch pointed at a heading with no id -> dangling label);
//   * headings keep semantic structure while buttons carry state;
//   * toggle state is per-section (independent open/close — REQUIRED),
//     initialized per spec: catalog & brands open, activity collapsed.
//
// Mobile/stacked behavior (≤920px, Option B): the whole card is collapsed
// behind the products-header "Filter 🎛️" pill — state lives in the
// storefront store (§7.1 `sidebarOpen`), which that button owns. The former
// full-width "Filter Options" text trigger is gone. Desktop keeps the
// sidebar docked unconditionally; the store flag only matters ≤920px.

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useStorefrontStore } from "@/stores/storefront-store";
import { CatalogAndUsageFilters } from "./CatalogAndUsageFilters";
import { LiveOrderTracking, RecentTransactions } from "./OrderActivity";

type SidebarSection = "catalog" | "brands" | "activity";

const BRANDS = [
  "Hikvision",
  "Dahua",
  "Cisco",
  "MikroTik",
  "Ubiquiti",
  "Dintek",
  "Cambium",
] as const;

export function ResponsiveSidebar(props: {
  categories: string[];
  usageTags: string[];
}) {
  const [openSections, setOpenSections] = useState<
    Record<SidebarSection, boolean>
  >({
    catalog: true,
    brands: true,
    activity: false,
  });

  const sidebarOpen = useStorefrontStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStorefrontStore((s) => s.setSidebarOpen);
  const pathname = usePathname();

  // Collapse the stacked panel whenever the route changes (e.g. /products →
  // /cart) so an opened filter card can never float onto unrelated pages.
  // Query-param changes keep the same pathname, so applying a filter inside
  // the panel leaves it open.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  function toggleSection(section: SidebarSection) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  return (
    <aside
      className="sidebar surface-card sidebar__panel"
      id="store-filters"
      data-open={sidebarOpen ? "true" : "false"}
      aria-label="Store filters and account activity"
    >
      <SidebarSection
        id="catalog"
        title="Categories & Product Usage"
        open={openSections.catalog}
        onToggle={() => toggleSection("catalog")}
      >
        <CatalogAndUsageFilters
          categories={props.categories}
          usageTags={props.usageTags}
        />
      </SidebarSection>

      <SidebarSection
        id="brands"
        title="Supported Brands"
        open={openSections.brands}
        onToggle={() => toggleSection("brands")}
      >
        <BrandFilters brands={BRANDS} />
      </SidebarSection>

      <SidebarSection
        id="activity"
        title="Live Order Tracking & Recent Transactions"
        open={openSections.activity}
        onToggle={() => toggleSection("activity")}
      >
        <LiveOrderTracking />
        <RecentTransactions />
      </SidebarSection>
    </aside>
  );
}

function SidebarSection({
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
  const panelId = `${id}-panel`;
  const buttonId = `${id}-heading-button`;

  return (
    <section>
      <h2>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span aria-hidden="true" className="sidebar__glyph">
            {open ? "−" : "+"}
          </span>
        </button>
      </h2>

      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * Brand checkboxes write directly into URL query params (§9.2 mandate:
 * "Filters should use URL query parameters" — shareable, back-button safe).
 */
function BrandFilters({ brands }: { brands: readonly string[] }) {
  return (
    <div className="sidebar__filters">
      {brands.map((brand) => (
        <BrandCheckbox key={brand} brand={brand} />
      ))}
    </div>
  );
}

function BrandCheckbox({ brand }: { brand: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = (searchParams.get("brand") ?? "").split(",").filter(Boolean);
  const checked = selected.includes(brand);

  const apply = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.length > 0) params.set("brand", next.join(","));
      else params.delete("brand");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <label>
      <input
        type="checkbox"
        name="brand"
        value={brand}
        checked={checked}
        onChange={() =>
          apply(
            checked
              ? selected.filter((b) => b !== brand)
              : [...selected, brand]
          )
        }
      />
      <span>{brand}</span>
    </label>
  );
}
