import Link from "next/link";

// src/components/services/ServiceNavigation.tsx
// Deliberately minimal: no cart link — the service domain does not sell
// through the cart (§2.4). Status lives under the account dashboard.
export function ServiceNavigation() {
  return (
    <nav className="service-nav" aria-label="Service platform">
      <Link className="btn btn--sm btn--secondary" href="/services">
        All services
      </Link>
      <Link className="btn btn--sm btn--secondary" href="/booking">
        Start a booking
      </Link>
      <Link className="btn btn--sm btn--ghost" href="/account/service-requests">
        My requests
      </Link>
    </nav>
  );
}
