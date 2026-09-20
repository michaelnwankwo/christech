// src/lib/catalog/filters-query.ts
// Pure codec between the URL query string (the committed, shareable filter
// state — §9.2) and the draft (what the sidebar controls while the sheet is
// open). No React, no router: this is the ONLY place filter⇄query mapping
// lives, so server parsing, client commit, and unit tests can never drift.
//
// Price values are NGN in the draft (major units, as typed) and integer
// minor units (kobo) in the URL, matching the bigint-money contract.

export type FilterDraft = {
  category: string;
  usage: string[];
  brands: string[];
  available: boolean;
  min: string; // major-unit string as typed; "" = unset
  max: string;
};

export const EMPTY_DRAFT: FilterDraft = {
  category: "",
  usage: [],
  brands: [],
  available: false,
  min: "",
  max: "",
};

function csv(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "1850000" (minor) → "18500"; "150" → "1.5"; invalid/non-positive → "" */
function minorToMajorOrEmpty(raw: string | null): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  // Round to kobo precision, then drop trailing zeros ("1.50" → "1.5").
  return String(Number((n / 100).toFixed(2)));
}

/**
 * "18500" / "18,500.50" → "1850050"; garbage/zero/negative → "".
 * The sign survives sanitization on purpose: "-12" must be REJECTED, never
 * silently turned into a positive amount.
 */
export function majorToMinorOrEmpty(raw: string): string {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return "";
  // toFixed(4) re-anchors to decimal intent before half-up rounding, so
  // values like 18500.005 don't depend on binary-float luck (1850000.499…).
  return String(Math.round(Number((n * 100).toFixed(4))));
}

export function draftFromQuery(sp: URLSearchParams): FilterDraft {
  return {
    category: sp.get("category") ?? "",
    usage: csv(sp.get("usage")),
    brands: csv(sp.get("brand")),
    available: sp.get("available") === "1",
    min: minorToMajorOrEmpty(sp.get("min")),
    max: minorToMajorOrEmpty(sp.get("max")),
  };
}

/**
 * Build the committed query. Only known filter keys are emitted — `page`
 * and anything else deliberately drop (a filter change resets pagination,
 * §9.2), so Apply always produces a canonical, shareable URL.
 */
export function draftToQuery(draft: FilterDraft): URLSearchParams {
  const params = new URLSearchParams();
  if (draft.category) params.set("category", draft.category);
  if (draft.usage.length) params.set("usage", draft.usage.join(","));
  if (draft.brands.length) params.set("brand", draft.brands.join(","));
  if (draft.available) params.set("available", "1");
  const min = majorToMinorOrEmpty(draft.min);
  if (min) params.set("min", min);
  const max = majorToMinorOrEmpty(draft.max);
  if (max) params.set("max", max);
  return params;
}

/** UI-visible active-filter count (same grouping rule as the server parse). */
export function countDraftFilters(draft: FilterDraft): number {
  return (
    (draft.category ? 1 : 0) +
    draft.usage.length +
    draft.brands.length +
    (draft.available ? 1 : 0) +
    (draft.min || draft.max ? 1 : 0)
  );
}

export function isDraftEmpty(draft: FilterDraft): boolean {
  return countDraftFilters(draft) === 0;
}
