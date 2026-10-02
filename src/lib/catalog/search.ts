// src/lib/catalog/search.ts
// Pure catalog-search helpers shared by the header search UI, the
// /api/search live-results route, the server catalog query, and the demo
// mirror — no React, no server-only imports, so vitest exercises the exact
// code every path runs.
//
// SECURITY/UX contract: raw user input NEVER reaches a PostgREST `or=`
// expression unsanitized — sanitizeSearchQuery strips the ILIKE wildcards
// (% _) and the PostgREST grammar characters (, ( ) * plus quotes) that
// would otherwise let a crafted querystring reshape the filter.

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_RESULT_LIMIT = 8;
export const SEARCH_QUERY_MAX_CHARS = 60;

/** The fields a catalog search matches (name, sku, brand, category). */
export const SEARCH_FIELDS = ["name", "sku", "brand", "category"] as const;

/**
 * Collapse free-typed input into a safe, bounded search token:
 *   "  Hikvision (dome) %42_ " → "Hikvision dome 42"
 * Returns "" for input that is empty after sanitizing.
 */
export function sanitizeSearchQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[%_(),*"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_QUERY_MAX_CHARS);
}

/** Case-insensitive contains over the searchable fields (demo mirror). */
export function matchesSearchFields(
  fields: Record<string, string | undefined>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < SEARCH_MIN_CHARS) return false;
  return SEARCH_FIELDS.some((key) => {
    const value = fields[key];
    return typeof value === "string" && value.toLowerCase().includes(needle);
  });
}

/** One live-search suggestion row (client-facing shape; no secrets). */
export type CatalogSearchResult = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  unitPriceMinor: number;
};
