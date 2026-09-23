// src/lib/supabase/storage.ts — one source of truth for the product-image
// storage contract (bucket name, extension whitelist, upload-path shape).
// The 0009 storage policy REQUIRES the `products/` folder prefix, so path
// building is security-relevant and lives here, not in components.

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_FOLDER = "products";
export const PRODUCT_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image
export const PRODUCT_IMAGE_MAX_COUNT = 12;

export function extensionOf(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return (PRODUCT_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
    ? ext
    : null;
}

/**
 * Deterministic-by-construction object path: `products/<epoch-ms>-<random>.<ext>`.
 * Returns null for rejected files (bad extension) — callers must not upload
 * on null. Name components are generated, never user text, so there is no
 * path-injection surface.
 */
export function objectPathForUpload(
  fileName: string,
  now: number = Date.now(),
  rnd: string = Math.random().toString(36).slice(2, 9)
): string | null {
  const ext = extensionOf(fileName);
  if (!ext) return null;
  const safeRnd = rnd.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "0000001";
  return `${PRODUCT_IMAGE_FOLDER}/${now}-${safeRnd.toLowerCase()}.${ext}`;
}

/**
 * Public object URL for a stored path. Uses the same host as the project's
 * Supabase env so staging and prod never cross streams.
 */
export function publicUrlForProductImage(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`;
}

/** True when a URL points at this project's public product-images bucket. */
export function isProductImageUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.pathname.includes(`/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`)
    );
  } catch {
    return false;
  }
}
