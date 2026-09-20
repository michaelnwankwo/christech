import Link from "next/link";
import Image from "next/image";

// src/components/layout/BrandLogo.tsx
// Primary logo lives at public/logo.png (1309×800, "CHRISVISCUS
// TECHNOLOGIES" wordmark). next/image keeps the intrinsic ratio via matching
// width/height props; display size is CSS-driven (height 38/30px, width
// auto) so it renders undistorted at every breakpoint. unoptimized keeps the
// byte path CSP-safe (img-src 'self'), same as before.
export function BrandLogo() {
  return (
    <Link
      href="/"
      className="brand-logo"
      aria-label="Chrisviscus Technologies — home"
    >
      <Image
        src="/logo.png"
        alt="Chrisviscus Technologies"
        width={1309}
        height={800}
        priority
        unoptimized
      />
    </Link>
  );
}

/** Compact monogram (footer/zero-network fallback) — redrawn to match the
 *  uploaded mark: brand-blue rounded square, white hook, nested C ring. */
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
      <rect x="4" y="4" width="92" height="92" rx="26" fill="#1049d6" />
      <path
        d="M42 10 V48 a26 26 0 0 0 26 26 H96 V64 H74 a16 16 0 0 1 -16 -16 V10 Z"
        fill="#ffffff"
      />
      <path
        d="M78 20 a17 17 0 1 0 12 29 h6 v-9 h-6 a8 8 0 1 1 -6 -13 Z"
        fill="#ffffff"
      />
    </svg>
  );
}
