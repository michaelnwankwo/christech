// tests/header-search.test.ts
// Catalog search plumbing shared by the header UI, /api/search, and the
// products page: sanitizer hardening + demo-mirror semantics.

import { describe, expect, it } from "vitest";
import {
  matchesSearchFields,
  sanitizeSearchQuery,
  SEARCH_MIN_CHARS,
  SEARCH_QUERY_MAX_CHARS,
} from "@/lib/catalog/search";
import { demoListProductCards, demoSearchProducts } from "@/lib/demo/catalog";

describe("sanitizeSearchQuery", () => {
  it("strips ILIKE wildcards and PostgREST or= grammar characters", () => {
    expect(sanitizeSearchQuery('Hik%dome_(a),b*"\\')).toBe("Hik dome a b");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeSearchQuery("   hikvision    dome  ")).toBe(
      "hikvision dome"
    );
  });

  it("caps length at the configured maximum", () => {
    expect(sanitizeSearchQuery("a".repeat(200)).length).toBe(
      SEARCH_QUERY_MAX_CHARS
    );
  });

  it("returns an empty string for null/empty/grammar-only input", () => {
    expect(sanitizeSearchQuery(null)).toBe("");
    expect(sanitizeSearchQuery("")).toBe("");
    expect(sanitizeSearchQuery("  %%%___  ")).toBe("");
  });
});

describe("matchesSearchFields", () => {
  const fields = {
    name: "Hikvision DS-2CD2143G2-IU AcuSense 4MP Dome",
    sku: "HK-IPC-T124",
    brand: "Hikvision",
    category: "cameras",
  };

  it("matches case-insensitively across name, sku, brand, and category", () => {
    expect(matchesSearchFields(fields, "acuSense")).toBe(true);
    expect(matchesSearchFields(fields, "hk-ipc")).toBe(true);
    expect(matchesSearchFields(fields, "HIKVISION")).toBe(true);
    expect(matchesSearchFields(fields, "Cameras")).toBe(true);
  });

  it("rejects sub-minimum queries and non-matches", () => {
    expect(matchesSearchFields(fields, "h")).toBe(false);
    expect(matchesSearchFields(fields, "cisco")).toBe(false);
  });
});

describe("demoSearchProducts", () => {
  it("returns name-sorted, capped suggestions for a live query", () => {
    const results = demoSearchProducts("hikvision");
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results.every((r) => r.brand === "Hikvision")).toBe(true);
    const names = results.map((r) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    expect(results[0]).toHaveProperty("slug");
    expect(results[0]).toHaveProperty("sku");
    expect(results[0]).toHaveProperty("unitPriceMinor");
  });

  it("matches SKUs (the model-number path the mobile placeholder hints at)", () => {
    const results = demoSearchProducts("HK-NVR");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.sku).toContain("HK-NVR");
  });

  it("is empty below the minimum length", () => {
    expect(demoSearchProducts("h")).toEqual([]);
    expect(demoSearchQueryThreshold()).toBe(SEARCH_MIN_CHARS);
  });
});

function demoSearchQueryThreshold(): number {
  // The demo mirror must agree with the shared minimum: feed a 1-char query
  // through the FULL list filter to prove nothing bypasses the constant.
  const filtered = demoListProductCards({ search: "h" });
  expect(filtered.totalCount).toBe(0);
  return SEARCH_MIN_CHARS;
}

describe("demoListProductCards search filter", () => {
  it("narrows the catalog by free-text search", () => {
    const all = demoListProductCards({});
    const hits = demoListProductCards({ search: "dome" });
    expect(hits.totalCount ?? 0).toBeGreaterThan(0);
    expect((hits.totalCount ?? 0) as number).toBeLessThan(
      all.totalCount ?? Infinity
    );
    expect(
      hits.cards.every((c) => c.name.toLowerCase().includes("dome"))
    ).toBe(true);
  });

  it("composes with category filters (AND semantics)", () => {
    const hits = demoListProductCards({ search: "hikvision", category: "cameras" });
    expect(hits.totalCount ?? 0).toBeGreaterThan(0);
    expect(hits.cards.every((c) => c.category === "cameras")).toBe(true);
  });

  it("treats wildcard-only input as NO search (sanitized to empty)", () => {
    // The dangerous characters are stripped; an empty token must degrade to
    // "unfiltered" exactly like the SQL path — never an injection vector,
    // never a confusing zero-result dead end.
    const all = demoListProductCards({});
    const wildcards = demoListProductCards({ search: "%%%___" });
    expect(wildcards.totalCount).toBe(all.totalCount);
  });
});
