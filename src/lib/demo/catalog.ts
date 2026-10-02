// src/lib/demo/catalog.ts
// Pure demo-catalog reads — the exact filter/pagination semantics the SQL
// path applies (category, brands, usage ⊇, availability, price window, page
// size 50), so the offline UI behaves identically. Dependency-free (the
// ProductFilters import is type-only and erased) → unit-testable with
// vitest even though the real queries module is server-only.

import type { ProductCard, ProductDetail, ServiceVM } from "@/types/catalog";
import type { ProductFilters } from "@/lib/catalog/queries";
import {
  matchesSearchFields,
  sanitizeSearchQuery,
  SEARCH_MIN_CHARS,
  SEARCH_RESULT_LIMIT,
  type CatalogSearchResult,
} from "@/lib/catalog/search";
import { DEMO_PRODUCTS, DEMO_SERVICES } from "./data";

export const DEMO_PAGE_SIZE = 50;

export function demoListProductCards(filters: ProductFilters): {
  cards: ProductCard[];
  page: number;
  pageSize: number;
  totalCount: number | null;
} {
  let rows = DEMO_PRODUCTS.slice();

  if (filters.category)
    rows = rows.filter((p) => p.category === filters.category);
  if (filters.brand?.length)
    rows = rows.filter((p) => filters.brand!.includes(p.brand));
  if (filters.usage?.length)
    rows = rows.filter((p) => filters.usage!.every((u) => p.usageTags.includes(u)));
  if (filters.availableOnly)
    rows = rows.filter((p) => p.inventoryQty > 0);
  if (typeof filters.minNgnMinor === "number")
    rows = rows.filter((p) => p.unitPriceMinor >= filters.minNgnMinor!);
  if (typeof filters.maxNgnMinor === "number")
    rows = rows.filter((p) => p.unitPriceMinor <= filters.maxNgnMinor!);
  if (filters.search) {
    const token = sanitizeSearchQuery(filters.search);
    if (token)
      rows = rows.filter((p) =>
        matchesSearchFields(
          { name: p.name, sku: p.sku, brand: p.brand, category: p.category },
          token
        )
      );
  }

  const page = Math.max(1, filters.page ?? 1);
  const total = rows.length;
  const slice = rows.slice((page - 1) * DEMO_PAGE_SIZE, page * DEMO_PAGE_SIZE);

  const addons = DEMO_SERVICES.filter((s) => s.kind === "add_on").map((s) => ({
    id: s.id,
    name: s.name,
    basePriceMinor: s.basePriceMinor,
  }));

  return {
    cards: slice.map((p) => ({
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category,
      usageTags: p.usageTags,
      unitPriceMinor: p.unitPriceMinor,
      inventoryQty: p.inventoryQty,
      imageUrls: p.imageUrls,
      addonServices: addons,
    })),
    page,
    pageSize: DEMO_PAGE_SIZE,
    totalCount: total,
  };
}

export function demoCategories(): string[] {
  return [...new Set(DEMO_PRODUCTS.map((p) => p.category))].sort();
}

/**
 * Live-search mirror for /api/search: same field semantics (name / sku /
 * brand / category, case-insensitive contains) and the same result limit,
 * sorted by name — the offline header dropdown behaves exactly like the
 * Supabase-backed one.
 */
export function demoSearchProducts(
  query: string,
  limit: number = SEARCH_RESULT_LIMIT
): CatalogSearchResult[] {
  const token = sanitizeSearchQuery(query);
  if (token.length < SEARCH_MIN_CHARS) return [];
  return DEMO_PRODUCTS.filter((p) =>
    matchesSearchFields(
      { name: p.name, sku: p.sku, brand: p.brand, category: p.category },
      token
    )
  )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category,
      sku: p.sku,
      unitPriceMinor: p.unitPriceMinor,
    }));
}

export function demoUsageTags(): string[] {
  return [...new Set(DEMO_PRODUCTS.flatMap((p) => p.usageTags))].sort();
}

export function demoProductDetail(slug: string): ProductDetail | null {
  const p = DEMO_PRODUCTS.find((row) => row.slug === slug);
  if (!p) return null;
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    description: p.description,
    brand: p.brand,
    category: p.category,
    usageTags: p.usageTags,
    imageUrls: p.imageUrls,
    unitPriceMinor: p.unitPriceMinor,
    inventoryQty: p.inventoryQty,
    shippingClass: p.shippingClass,
    availableAddons: DEMO_SERVICES.filter((s) => s.kind === "add_on").map(
      (s) => ({
        id: s.id,
        name: s.name,
        basePriceMinor: s.basePriceMinor,
        durationMinutes: s.durationMinutes,
      })
    ),
  };
}

export function demoBookingServices(): ServiceVM[] {
  return DEMO_SERVICES.filter((s) => s.kind === "booking")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(demoServiceVM);
}

export function demoBookingService(slug: string): ServiceVM | null {
  const s = DEMO_SERVICES.find((row) => row.slug === slug && row.kind === "booking");
  return s ? demoServiceVM(s) : null;
}

export function demoServiceVM(
  s: (typeof DEMO_SERVICES)[number]
): ServiceVM {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    kind: s.kind,
    basePriceMinor: s.basePriceMinor,
    durationMinutes: s.durationMinutes,
    requiresSchedule: s.requiresSchedule,
  };
}
