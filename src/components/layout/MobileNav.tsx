"use client";

// src/components/layout/MobileNav.tsx
// ≤768px header entry point: a 44px hamburger that opens a full-width
// slide-down panel carrying everything the desktop row hides. The redundant
// standalone "Shop"/"Services" links are gone — the AppModeSwitch row IS the
// domain navigation (Store → /products, Book → /services). Bottom utility
// row: currency picker + profile avatar on the left, Sign out far right.
// The cart lives in the mobile top bar (.site-header__mobile-actions).
// Closes on navigation and on Escape; the panel is `hidden` when closed so
// nothing in it stays focusable (no invisible-focus traps).

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppModeSwitch } from "./AppModeSwitch";
import { CurrencyPicker } from "./CurrencyPicker";
import { MobileProfileRow } from "./UserMenu";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mobile-nav-host">
      <button
        type="button"
        className="icon-btn site-header__burger"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>

      <nav
        id="mobile-nav-panel"
        className="mobile-nav"
        aria-label="Mobile navigation"
        hidden={!open}
      >
        <AppModeSwitch />
        {/* Profile first — an explicit, labeled row, not a lone avatar. */}
        <MobileProfileRow />
        <div className="mobile-nav__util">
          <CurrencyPicker />
        </div>
      </nav>
    </div>
  );
}
