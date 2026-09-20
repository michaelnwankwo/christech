"use client";

// src/components/sidebar/FilterSections.tsx
// The five filter controls as draft-bound UI (staged apply, see
// filter-draft.tsx). NOTHING in this file touches the router or the URL —
// every click writes into the FilterDraftContext; only the sidebar footer's
// "Apply" promotes the draft into a query-string navigation. Price inputs
// are controlled text fields (no per-form submit): typing alone can never
// refilter the page.

import { formatMinorMoney } from "@/lib/currency/money";
import { useFilterDraft } from "./filter-draft";

export const BRAND_OPTIONS = [
  "Hikvision",
  "Dahua",
  "Cisco",
  "MikroTik",
  "Ubiquiti",
  "Dintek",
  "Cambium",
] as const;

export function CategoryFilter({ categories }: { categories: string[] }) {
  const { draft, setCategory } = useFilterDraft();

  return (
    <div className="sidebar__filters">
      {categories.map((category) => (
        <label key={category}>
          <input
            type="radio"
            name="category"
            checked={draft.category === category}
            onChange={() => setCategory(category)}
          />
          <span>{titleCase(category)}</span>
        </label>
      ))}
      {draft.category ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setCategory("")}
        >
          Clear category
        </button>
      ) : null}
    </div>
  );
}

export function UsageFilter({ usageTags }: { usageTags: string[] }) {
  const { draft, toggleUsage } = useFilterDraft();

  return (
    <div className="sidebar__filters">
      {usageTags.map((tag) => (
        <label key={tag}>
          <input
            type="checkbox"
            name={`usage-${tag}`}
            checked={draft.usage.includes(tag)}
            onChange={() => toggleUsage(tag)}
          />
          <span>{titleCase(tag)}</span>
        </label>
      ))}
    </div>
  );
}

export function AvailabilityFilter() {
  const { draft, setAvailable } = useFilterDraft();

  return (
    <div className="sidebar__filters">
      <label>
        <input
          type="checkbox"
          name="available"
          checked={draft.available}
          onChange={(event) => setAvailable(event.target.checked)}
        />
        <span>In stock only</span>
      </label>
    </div>
  );
}

export function BrandFilterList() {
  return (
    <div className="sidebar__filters">
      {BRAND_OPTIONS.map((brand) => (
        <BrandCheckbox key={brand} brand={brand} />
      ))}
    </div>
  );
}

function BrandCheckbox({ brand }: { brand: string }) {
  const { draft, toggleBrand } = useFilterDraft();

  return (
    <label>
      <input
        type="checkbox"
        name="brand"
        value={brand}
        checked={draft.brands.includes(brand)}
        onChange={() => toggleBrand(brand)}
      />
      <span>{brand}</span>
    </label>
  );
}

/**
 * Price range (NGN, major units as typed). Draft-only by construction:
 * values flow through context state and become kobo query params solely at
 * commit time inside draftToQuery (which also sanitizes garbage to "").
 */
export function PriceRangeFilter() {
  const { draft, setPrice } = useFilterDraft();

  return (
    <div className="sidebar__price-row">
      <div className="field">
        <label htmlFor="price-min">Min</label>
        <input
          id="price-min"
          name="min"
          inputMode="numeric"
          placeholder={formatMinorMoney(0, "NGN").replace(/[\d.,]/g, "")}
          value={draft.min}
          onChange={(event) => setPrice(event.target.value, draft.max)}
        />
      </div>
      <div className="field">
        <label htmlFor="price-max">Max</label>
        <input
          id="price-max"
          name="max"
          inputMode="numeric"
          placeholder="—"
          value={draft.max}
          onChange={(event) => setPrice(draft.min, event.target.value)}
        />
      </div>
    </div>
  );
}

function titleCase(input: string): string {
  return input
    .split(/[\s-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
