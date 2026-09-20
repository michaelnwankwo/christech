import Link from "next/link";
import Image from "next/image";

// src/components/layout/BrandLogo.tsx
// Header/drawer brand mark lives at public/logo-header.png — the full
// wordmark art cropped to its alpha bbox (1106×167) so the CSS box IS the
// visible size (the uncropped /logo.png is ~79% transparent padding, which
// made "big" heights render as ~15px marks). The hero keeps the padded
// original. next/image keeps the intrinsic ratio via matching width/height
// props; display size stays CSS-driven (height auto-width), so the mark is
// undistorted at every breakpoint. unoptimized keeps the byte path CSP-safe
// (img-src 'self'), same as before.
export function BrandLogo() {
  return (
    <Link
      href="/"
      className="brand-logo"
      aria-label="Chrisviscus Technologies — home"
    >
      <Image
        src="/logo-header.png"
        alt="Chrisviscus Technologies"
        width={1106}
        height={167}
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
