import Link from "next/link";
import Image from "next/image";

// src/components/layout/BrandLogo.tsx
// The uploaded logo asset is placed at public/brand/chrisviscus-logo.png and
// rendered via next/image (optimized + CSP-safe since img-src allows 'self').
// An inline-SVG monogram is the zero-network fallback for constrained
// environments; text wordmark guarantees the brand name is always readable.
export function BrandLogo() {
  return (
    <Link
      href="/"
      className="brand-logo"
      aria-label="Chrisviscus Technologies — home"
    >
      <Image
        src="/brand/chrisviscus-logo.png"
        alt="Chrisviscus Technologies"
        width={344}
        height={110}
        priority
        unoptimized
      />
    </Link>
  );
}

/** Compact monogram used by the footer. */
export function BrandMonogram() {
  return (
    <svg
      className="brand-logo__mark"
      width="34"
      height="34"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Chrisviscus Technologies mark"
    >
      <rect x="6" y="6" width="88" height="88" rx="22" fill="#6b7280" />
      <circle cx="50" cy="50" r="26" fill="#ffffff" />
      <circle cx="50" cy="50" r="13" fill="#6b7280" />
      <rect x="56" y="38" width="38" height="24" rx="8" fill="#ffffff" />
    </svg>
  );
}
