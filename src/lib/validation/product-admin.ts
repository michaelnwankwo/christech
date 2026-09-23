// src/lib/validation/product-admin.ts — the ONLY shape the admin catalog
// writer accepts (0003 RLS does the AUTHZ half; this does the DATA half).
// Money stays strict: the form collects naira as text, this converts to
// minor units (bigint column), and the browser never chooses the charged
// amount — display/charge conversion happens server-side at quote time.

import { z } from "zod";

/** Mirror of the products.brand check constraint (0001). */
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

/**
 * "1,850,000" → 185000000 ; "12.5" → 1250 ; anything else → null.
 * Comma-grouped thousands + up to 2 decimals, no signs, no sci-notation,
 * bounded so the bigint column can never overflow.
 */
export function parseNairaToMinor(input: string): number | null {
  const cleaned = input.trim();
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const numeric = cleaned.replace(/,/g, "");
  const value = Number(numeric);
  if (!Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value * 100);
  if (minor > 900_000_000_000_00) return null; // 9e12 naira cap — absurd above this
  return minor;
}

/** "cctv, ip-camera" → ["cctv","ip-camera"] (dedup, sorted, validated). */
export function normalizeUsageTags(input: string): string[] | null {
  if (!input.trim()) return [];
  const parts = input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length > 8) return null;
  const set = new Set(parts);
  for (const t of set) {
    if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(t)) return null;
  }
  return [...set].sort();
}

export const productAdminSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/, "3–64 chars: letters, digits, . _ - (no leading separator)"),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase kebab-case only (e.g. ds-2cd2020i-g2)"),
  name: z.string().trim().min(3).max(255),
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((s) => (s.length ? s : null))
    .optional(),
  brand: z.enum(PRODUCT_BRANDS),
  // products.category is the free-text slug kept aligned with
  // public.categories.slug by the action (which cross-checks membership).
  category: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  priceNaira: z.string().min(1).transform((s) => s), // parsed by parseNairaToMinor in the action
  inventoryQty: z.coerce.number().int().min(0).max(1_000_000),
  shippingClass: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,32}$/, "Lowercase token, ≤32 chars (matches shipping_rate_cards)"),
  usageTagsRaw: z.string().max(255).optional().default(""),
  imageUrls: z
    .array(z.string().url().startsWith("https://"))
    .max(12)
    .default([]),
  isActive: z.coerce.boolean().default(true),
});

export type ProductAdminInput = z.input<typeof productAdminSchema>;

/** Action-friendly error list from a ZodError. */
export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
