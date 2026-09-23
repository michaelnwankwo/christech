// tests/product-admin.test.ts — the admin-catalog pure core: money parsing,
// tag normalization, schema acceptance, storage path building. The zod
// schema and parseNairaToMinor here are the SAME modules the server action
// imports — no reimplementation.
import { describe, expect, it } from "vitest";
import {
  normalizeUsageTags,
  parseNairaToMinor,
  productAdminSchema,
} from "@/lib/validation/product-admin";
import {
  isProductImageUrl,
  objectPathForUpload,
  publicUrlForProductImage,
} from "@/lib/supabase/storage";

describe("parseNairaToMinor", () => {
  it("accepts comma-grouped naira and returns integer minor units", () => {
    expect(parseNairaToMinor("1,850,000")).toBe(185000000);
    expect(parseNairaToMinor("12.5")).toBe(1250);
    expect(parseNairaToMinor("0")).toBe(0);
    expect(parseNairaToMinor(" 500 ")).toBe(50000);
  });
  it("rejects anything that isn't plain non-negative decimal money", () => {
    expect(parseNairaToMinor("-5")).toBeNull();
    expect(parseNairaToMinor("1,2,3")).toBeNull();
    expect(parseNairaToMinor("1.234")).toBeNull();
    expect(parseNairaToMinor("1e9")).toBeNull();
    expect(parseNairaToMinor("₦1,000")).toBeNull();
    expect(parseNairaToMinor("")).toBeNull();
  });
  it("caps before bigint/float-precision danger", () => {
    expect(parseNairaToMinor("9,999,999,999,999")).toBeNull(); // 1e13 ₦ → 1e15 minor > cap
    expect(parseNairaToMinor("9,000,000,000")).toBe(900000000000);
  });
});

describe("normalizeUsageTags", () => {
  it("dedupes, sorts and lowercases", () => {
    expect(normalizeUsageTags("CCTV, ip-camera ,cctv")).toEqual(["cctv", "ip-camera"]);
    expect(normalizeUsageTags("")).toEqual([]);
  });
  it("rejects junk tags and over-cap lists", () => {
    expect(normalizeUsageTags("bad tag!")).toBeNull();
    expect(normalizeUsageTags(Array.from({ length: 9 }, (_, i) => `t${i}`).join(", "))).toBeNull();
  });
});

describe("productAdminSchema", () => {
  const base = {
    sku: "HKV-DOME-2MP",
    slug: "hkv-dome-2mp",
    name: "2MP Dome Camera",
    brand: "Hikvision",
    category: "cameras",
    priceNaira: "45,000",
    inventoryQty: "12",
    shippingClass: "standard",
  };
  it("accepts a valid create payload", () => {
    const parsed = productAdminSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isActive).toBe(true); // default
      expect(parsed.data.imageUrls).toEqual([]); // default
    }
  });
  it("refuses uppercase or slash slugs (URL contract)", () => {
    expect(productAdminSchema.safeParse({ ...base, slug: "Dome/2MP" }).success).toBe(false);
  });
  it("refuses brands outside the DB check constraint", () => {
    expect(productAdminSchema.safeParse({ ...base, brand: "Nestle" }).success).toBe(false);
  });
  it("refuses http image urls (mixed content on an https site)", () => {
    expect(
      productAdminSchema.safeParse({ ...base, imageUrls: ["http://e.com/a.jpg"] }).success
    ).toBe(false);
  });
});

describe("storage paths", () => {
  it("builds the products/<epoch>-<rand>.<ext> path the 0009 policy requires", () => {
    expect(objectPathForUpload("DSC 4000.JPG", 1700000000000, "Ab3dEf9")).toBe(
      "products/1700000000000-ab3def9.jpg"
    );
  });
  it("rejects disallowed extensions before any upload", () => {
    expect(objectPathForUpload("payload.exe")).toBeNull();
    expect(objectPathForUpload("photo.svg")).toBeNull();
  });
  it("public URL points at the project's own supabase host", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co/";
    expect(publicUrlForProductImage("products/1-a.jpg")).toBe(
      "https://ref.supabase.co/storage/v1/object/public/product-images/products/1-a.jpg"
    );
    expect(isProductImageUrl("https://ref.supabase.co/storage/v1/object/public/product-images/products/1-a.jpg")).toBe(true);
    expect(isProductImageUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isProductImageUrl("not a url")).toBe(false);
  });
});
