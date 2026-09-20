// tests/filter-draft.test.ts — the staged-apply codec. The sheet's whole
// promise is "controls never touch the URL; Apply commits exactly what the
// draft holds", so the pure mapping functions get the same rigor as the
// server-side parse: URL→draft→URL round-trips must be stable, price values
// must land in integer kobo (or vanish when garbage), and the committed
// query must contain ONLY known filter keys (pagination always resets).

import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  countDraftFilters,
  draftFromQuery,
  draftToQuery,
  isDraftEmpty,
  majorToMinorOrEmpty,
} from "@/lib/catalog/filters-query";

describe("draftFromQuery", () => {
  it("maps an empty query to the empty draft", () => {
    expect(draftFromQuery(new URLSearchParams(""))).toEqual(EMPTY_DRAFT);
  });

  it("parses every filter group, csv lists included", () => {
    const sp = new URLSearchParams(
      "category=recorders&usage=enterprise,smb&brand=Cisco,Dahua&available=1&min=1850000&max=50000000&page=3"
    );
    expect(draftFromQuery(sp)).toEqual({
      category: "recorders",
      usage: ["enterprise", "smb"],
      brands: ["Cisco", "Dahua"],
      available: true,
      min: "18500",
      max: "500000",
    });
  });

  it("treats only available=1 as checked and ignores junk prices", () => {
    const sp = new URLSearchParams("available=yes&min=abc&max=-4");
    const d = draftFromQuery(sp);
    expect(d.available).toBe(false);
    expect(d.min).toBe("");
    expect(d.max).toBe("");
  });

  it("preserves fractional kobo (150 minor -> '1.5' major)", () => {
    expect(draftFromQuery(new URLSearchParams("min=150")).min).toBe("1.5");
  });
});

describe("draftToQuery (the commit)", () => {
  it("emits nothing for the empty draft (Clear all + Apply = clean URL)", () => {
    expect(draftToQuery(EMPTY_DRAFT).toString()).toBe("");
  });

  it("converts price majors to integer minor units", () => {
    const q = draftToQuery({
      ...EMPTY_DRAFT,
      min: "18,500.50",
      max: "2000",
    });
    expect(q.get("min")).toBe("1850050");
    expect(q.get("max")).toBe("200000");
  });

  it("drops garbage prices instead of corrupting the URL", () => {
    const q = draftToQuery({ ...EMPTY_DRAFT, min: "abc", max: "0" });
    expect(q.has("min")).toBe(false);
    expect(q.has("max")).toBe(false);
  });

  it("never carries page/unknown keys — filter changes reset pagination", () => {
    const q = draftToQuery({ ...EMPTY_DRAFT, category: "cameras" });
    expect(q.toString()).toBe("category=cameras");
  });
});

describe("URL -> draft -> URL round trip", () => {
  it("is stable for canonical queries", () => {
    const original = new URLSearchParams(
      "category=cctv&usage=home&brand=Hikvision,Cisco&available=1&min=500000&max=99999999"
    );
    const committed = draftToQuery(draftFromQuery(original));
    expect([...committed.keys()].sort()).toEqual(
      [...original.keys()].sort()
    );
    for (const key of original.keys()) {
      expect(committed.get(key)).toBe(original.get(key));
    }
  });
});

describe("counting", () => {
  it("groups min+max as ONE price filter and brands per-value", () => {
    expect(
      countDraftFilters({
        ...EMPTY_DRAFT,
        min: "1000",
        max: "5000",
        brands: ["Cisco", "Dahua"],
      })
    ).toBe(3);
  });

  it("isDraftEmpty agrees with count", () => {
    expect(isDraftEmpty(EMPTY_DRAFT)).toBe(true);
    expect(
      isDraftEmpty({ ...EMPTY_DRAFT, available: true })
    ).toBe(false);
  });
});

describe("majorToMinorOrEmpty", () => {
  it("rounds half-up to kobo", () => {
    expect(majorToMinorOrEmpty("18500.005")).toBe("1850001");
  });
  it("rejects zero, negatives, and junk", () => {
    expect(majorToMinorOrEmpty("")).toBe("");
    expect(majorToMinorOrEmpty("0")).toBe("");
    expect(majorToMinorOrEmpty("-12")).toBe("");
    expect(majorToMinorOrEmpty("one two")).toBe("");
  });
});
