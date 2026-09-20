"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// src/components/services/ServiceNavigation.tsx
// Deliberately minimal: no cart link — the service domain does not sell
// through the cart (§2.4). Status lives under the account dashboard.
// The "All services" tab hides itself on /services itself (you are already
// there — the listing has only forward actions); everywhere else in the
// group — including the booking wizard — it stays and navigates back.
export function ServiceNavigation() {
  const pathname = usePathname();
  const onListing = pathname === "/services";

  return (
    <nav className="service-nav" aria-label="Service platform">
      {onListing ? null : (
        <Link className="btn btn--sm btn--secondary" href="/services">
          All services
        </Link>
      )}
      <Link className="btn btn--sm btn--secondary" href="/booking">
        Start a booking
      </Link>
      <Link className="btn btn--sm btn--ghost" href="/account/service-requests">
        My requests
      </Link>
    </nav>
  );
}
