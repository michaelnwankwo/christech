"use client";

// src/components/layout/SiteHeader.tsx
// Composes the §8.2 header tree: BrandLogo, AppModeSwitch, CurrencyPicker,
// CartTrigger, UserMenu. Cart UI is rendered ONLY in storefront mode —
// booking pages physically cannot reach the drawer from here (§8.3).
//
// Responsive contract: the desktop cluster collapses into MobileNav's
// slide-down panel below 768px (see globals.css + MobileNav.tsx). Every
// touch target in the mobile panel is ≥44px.

import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { AppModeSwitch } from "./AppModeSwitch";
import { CurrencyPicker } from "./CurrencyPicker";
import { CartTrigger } from "./CartTrigger";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import type { AppMode } from "@/stores/cart-store";

export function SiteHeader({ mode }: { mode: AppMode }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo />
        <span className="site-header__modeswitch">
          <AppModeSwitch />
        </span>
        <span className="site-header__spacer" />
        <div className="site-header__desktop">
          <nav className="row" aria-label="Primary">
            <Link href="/products">Shop</Link>
            <Link href="/services">Services</Link>
          </nav>
          <CurrencyPicker />
          {mode === "storefront" ? <CartTrigger /> : null}
          <UserMenu />
        </div>
        <MobileNav mode={mode} />
      </div>
    </header>
  );
}
