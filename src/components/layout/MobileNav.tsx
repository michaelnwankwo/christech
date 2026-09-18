"use client";

// src/components/layout/MobileNav.tsx
// ≤768px header entry point: a 44px hamburger that opens a full-width
// slide-down panel carrying everything the desktop row hides (Shop/Services
// links, mode switch, currency, cart, user menu). Closes on navigation and
// on Escape; the panel is `hidden` when closed so its links leave the tab
// order (no invisible-focus traps).

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppModeSwitch } from "./AppModeSwitch";
import { CurrencyPicker } from "./CurrencyPicker";
import { CartTrigger } from "./CartTrigger";
import { UserMenu } from "./UserMenu";
import type { AppMode } from "@/stores/cart-store";

export function MobileNav({ mode }: { mode: AppMode }) {
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
        <Link href="/products">Shop</Link>
        <Link href="/services">Services</Link>
        <AppModeSwitch />
        <CurrencyPicker />
        {mode === "storefront" ? <CartTrigger /> : null}
        <UserMenu />
      </nav>
    </div>
  );
}
