"use client";

// src/components/sidebar/CatalogAndUsageFilters.tsx
// Category + usage + availability + price-range filters — all expressed as
// URL query parameters (blueprint §9.2), so /products?category=networking
// &brand=Cisco&usage=enterprise works, is shareable, and survives reload.

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatMinorMoney } from "@/lib/currency/money";

export function CatalogAndUsageFilters(props: {
  categories: string[];
  usageTags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category") ?? "";
  const usageSelected = (searchParams.get("usage") ?? "").split(",").filter(Boolean);
  const availableOnly = searchParams.get("available") === "1";
  const minNgn = searchParams.get("min") ?? "";
  const maxNgn = searchParams.get("max") ?? "";

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page"); // any filter change resets pagination
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="sidebar__filters">
      <span className="filter-group__title">Category</span>
      {props.categories.map((category) => (
        <label key={category}>
          <input
            type="radio"
            name="category"
            checked={activeCategory === category}
            onChange={() =>
              pushParams((p) =>
                activeCategory === category
                  ? p.delete("category")
                  : p.set("category", category)
              )
            }
          />
          <span>{titleCase(category)}</span>
        </label>
      ))}
      {activeCategory ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => pushParams((p) => p.delete("category"))}
        >
          Clear category
        </button>
      ) : null}

      <span className="filter-group__title">Product usage</span>
      {props.usageTags.map((tag) => (
        <label key={tag}>
          <input
            type="checkbox"
            name={`usage-${tag}`}
            checked={usageSelected.includes(tag)}
            onChange={() =>
              pushParams((p) => {
                const next = usageSelected.includes(tag)
                  ? usageSelected.filter((t) => t !== tag)
                  : [...usageSelected, tag];
                if (next.length) p.set("usage", next.join(","));
                else p.delete("usage");
              })
            }
          />
          <span>{titleCase(tag)}</span>
        </label>
      ))}

      <span className="filter-group__title">Availability</span>
      <label>
        <input
          type="checkbox"
          name="available"
          checked={availableOnly}
          onChange={() =>
            pushParams((p) =>
              availableOnly ? p.delete("available") : p.set("available", "1")
            )
          }
        />
        <span>In stock only</span>
      </label>

      <span className="filter-group__title">Price range (NGN)</span>
      <form
        className="sidebar__price-row"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          pushParams((p) => {
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

      <div className="sidebar__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => router.push(pathname, { scroll: false })}
        >
          Reset all filters
        </button>
      </div>
    </div>
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
