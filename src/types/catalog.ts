// src/types/catalog.ts
// View-models for catalog data. The base currency is ALWAYS NGN minor units
// (blueprint §2.2); display conversions are cosmetic projections only.

export const CURRENCY_CODES = ["NGN", "USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCY_CODES)[number];

export const PRODUCT_BRANDS = [
  "Hikvision",
  "Dahua",
  "Cisco",
  "MikroTik",
  "Ubiquiti",
  "Dintek",
  "Cambium",
  "Other",
] as const;
export type ProductBrand = (typeof PRODUCT_BRANDS)[number];

/** Brand filter chips exclude 'Other' per §9.1 (supported-brands list). */
export const SIDEBAR_BRANDS = PRODUCT_BRANDS.filter(
  (b): b is Exclude<ProductBrand, "Other"> => b !== "Other"
);

export type ServiceKind = "booking" | "add_on";

export type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  brand: ProductBrand;
  category: string;
  usage_tags: string[];
  image_urls: string[];
  unit_price_minor: number;
  inventory_qty: number;
  shipping_class: string;
  is_active: boolean;
};

/** §10.2 — the exact ProductDetail shape the storefront consumes. */
export type ProductDetail = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string;
  category: string;
  usageTags: string[];
  imageUrls: string[];
  unitPriceMinor: number;
  inventoryQty: number;
  shippingClass: string;
  availableAddons: Array<{
    id: string;
    name: string;
    basePriceMinor: number;
    durationMinutes: number | null;
  }>;
};

export type ProductCard = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: ProductBrand;
  category: string;
  usageTags: string[];
  unitPriceMinor: number;
  inventoryQty: number;
  imageUrls: string[];
  /** Add-on services purchasable with this product (kind = 'add_on'). */
  addonServices: Array<{
    id: string;
    name: string;
    basePriceMinor: number;
  }>;
};

export type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ServiceKind;
  base_price_minor: number;
  duration_minutes: number | null;
  requires_schedule: boolean;
  is_active: boolean;
};

export type ServiceVM = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ServiceKind;
  basePriceMinor: number;
  durationMinutes: number | null;
  requiresSchedule: boolean;
};
