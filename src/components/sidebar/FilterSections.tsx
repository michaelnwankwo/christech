"use client";

// src/components/sidebar/FilterSections.tsx
// The storefront filter vocabulary (§9.2): every control is a thin writer
// over URL query params — shareable, back-button safe, server-filtered.
// One hook (`useFilterParams`) owns the push semantics: mutate → drop
// `page` → replace URL without scroll. Split into per-section components so
// the sidebar can order them Category → Usage → Availability → Brands →
// Price and pin Price last, with the sheet footer for bulk actions.

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatMinorMoney } from "@/lib/currency/money";

const FILTER_KEYS = ["category", "brand", "usage", "available", "min", "max"] as const;

export function useFilterParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apply = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page"); // any filter change resets pagination
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { pathname, router, searchParams, apply };
}

/** Mirror of the server-side activeCount rule on the products page — used
 *  for the sheet's "Show results (n active)" label. */
export function countActiveFilters(sp: URLSearchParams): number {
  const list = (key: string) =>
    (sp.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean).length;
  return (
    (sp.get("category") ? 1 : 0) +
    list("brand") +
    list("usage") +
    (sp.get("available") === "1" ? 1 : 0) +
    (sp.get("min") || sp.get("max") ? 1 : 0)
  );
}

export function CategoryFilter({ categories }: { categories: string[] }) {
  const { searchParams, apply } = useFilterParams();
  const active = searchParams.get("category") ?? "";

  return (
    <div className="sidebar__filters">
      {categories.map((category) => (
        <label key={category}>
          <input
            type="radio"
            name="category"
            checked={active === category}
            onChange={() =>
              apply((p) =>
                active === category ? p.delete("category") : p.set("category", category)
              )
            }
          />
          <span>{titleCase(category)}</span>
        </label>
      ))}
      {active ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => apply((p) => p.delete("category"))}
        >
          Clear category
        </button>
      ) : null}
    </div>
  );
}

export function UsageFilter({ usageTags }: { usageTags: string[] }) {
  const { searchParams, apply } = useFilterParams();
  const selected = (searchParams.get("usage") ?? "").split(",").filter(Boolean);

  return (
    <div className="sidebar__filters">
      {usageTags.map((tag) => (
        <label key={tag}>
          <input
            type="checkbox"
            name={`usage-${tag}`}
            checked={selected.includes(tag)}
            onChange={() =>
              apply((p) => {
                const next = selected.includes(tag)
                  ? selected.filter((t) => t !== tag)
                  : [...selected, tag];
                if (next.length) p.set("usage", next.join(","));
                else p.delete("usage");
              })
            }
          />
          <span>{titleCase(tag)}</span>
        </label>
      ))}
    </div>
  );
}

export function AvailabilityFilter() {
  const { searchParams, apply } = useFilterParams();
  const availableOnly = searchParams.get("available") === "1";

  return (
    <div className="sidebar__filters">
      <label>
        <input
          type="checkbox"
          name="available"
          checked={availableOnly}
          onChange={() =>
            apply((p) => (availableOnly ? p.delete("available") : p.set("available", "1")))
          }
        />
        <span>In stock only</span>
      </label>
    </div>
  );
}

export const BRAND_OPTIONS = [
  "Hikvision",
  "Dahua",
  "Cisco",
  "MikroTik",
  "Ubiquiti",
  "Dintek",
  "Cambium",
] as const;

export function BrandFilterList({ brands }: { brands: readonly string[] }) {
  return (
    <div className="sidebar__filters">
      {brands.map((brand) => (
        <BrandCheckbox key={brand} brand={brand} />
      ))}
    </div>
  );
}

function BrandCheckbox({ brand }: { brand: string }) {
  const { searchParams, apply } = useFilterParams();
  const selected = (searchParams.get("brand") ?? "").split(",").filter(Boolean);
  const checked = selected.includes(brand);

  return (
    <label>
      <input
        type="checkbox"
        name="brand"
        value={brand}
        checked={checked}
        onChange={() =>
          apply((p) => {
            const next = checked
              ? selected.filter((b) => b !== brand)
              : [...selected, brand];
            if (next.length) p.set("brand", next.join(","));
            else p.delete("brand");
          })
        }
      />
      <span>{brand}</span>
    </label>
  );
}

/**
 * Price range (NGN). Min/Max edits are DRAFT until the form submits —
 * typing never changes the URL, so results only refilter on "Apply"
 * (sheet footer's "Show results" then closes; this button applies).
 */
export function PriceRangeFilter() {
  const { searchParams, apply } = useFilterParams();
  const minNgn = searchParams.get("min") ?? "";
  const maxNgn = searchParams.get("max") ?? "";

  return (
    <form
      className="sidebar__price-row"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        apply((p) => {
          setOrDelete(p, "min", ngnInputToMinor(String(data.get("min") ?? "")));
          setOrDelete(p, "max", ngnInputToMinor(String(data.get("max") ?? "")));
        });
      }}
    >
      <div className="field">
        <label htmlFor="price-min">Min</label>
        <input
          id="price-min"
          name="min"
          inputMode="numeric"
          placeholder={formatMinorMoney(0, "NGN").replace(/[\d.,]/g, "")}
          defaultValue={minNgn ? String(Number(minNgn) / 100) : ""}
        />
      </div>
      <div className="field">
        <label htmlFor="price-max">Max</label>
        <input
          id="price-max"
          name="max"
          inputMode="numeric"
          placeholder="—"
          defaultValue={maxNgn ? String(Number(maxNgn) / 100) : ""}
        />
      </div>
      <button type="submit" className="btn btn--sm">
        Apply
      </button>
    </form>
  );
}

/** Bulk reset used by the sheet footer (and hidden on desktop? no — the
 *  desktop dock keeps it too as a ghost button under the sections). */
export function ClearAllFilters() {
  const { pathname, router, searchParams } = useFilterParams();
  const hasAny = FILTER_KEYS.some((key) => searchParams.get(key));
  if (!hasAny) return null;
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => router.push(pathname, { scroll: false })}
    >
      Clear all
    </button>
  );
}

function ngnInputToMinor(raw: string): string {
  const value = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value * 100));
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function titleCase(input: string): string {
  return input
    .split(/[\s-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
