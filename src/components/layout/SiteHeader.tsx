"use client";

// src/components/layout/SiteHeader.tsx
// Composes the §8.2 header tree: BrandLogo, AppModeSwitch, CurrencyPicker,
// CartTrigger, UserMenu. Cart UI is rendered ONLY in storefront mode —
// booking pages physically cannot reach the drawer from here (§8.3).
//
// Responsive contract: the desktop cluster collapses into MobileNav's
// slide-down panel below 768px (see globals.css + MobileNav.tsx). Every
// touch target in the mobile panel is ≥44px.
// Mobile header (Option A — sticky top bar): brand left; cart (with absolute
// count badge) + drawer toggle right. The sticky/styling contract itself is
// on .site-header in globals.css. Desktop nav links were removed as
// redundant: AppModeSwitch routes to /products and /services, the mobile
// drawer carries the same links, and the cart lives in the mobile top bar.

import { BrandLogo } from "./BrandLogo";
import { AppModeSwitch } from "./AppModeSwitch";
import { CurrencyPicker } from "./CurrencyPicker";
import { CartTrigger } from "./CartTrigger";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import { HeaderSearch, MobileSearch } from "./HeaderSearch";
import type { AppMode } from "@/stores/cart-store";

export function SiteHeader({ mode }: { mode: AppMode }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo />
        <span className="site-header__modeswitch">
          <AppModeSwitch />
        </span>
        {/* Desktop inline catalog search — sits between the mode pills and
            the currency/account cluster; collapses away below 768px where
            MobileSearch (inside .site-header__mobile-actions) takes over. */}
        <HeaderSearch />
        <span className="site-header__spacer" />
        <div className="site-header__desktop">
          <CurrencyPicker />
          {mode === "storefront" ? <CartTrigger /> : null}
          <UserMenu />
        </div>
        <span className="site-header__mobile-actions">
          {/* Search toggle sits between the brand logo and the cart icon;
              its full-width panel anchors to the sticky header (top:100%). */}
          <MobileSearch />
          {mode === "storefront" ? <CartTrigger compact /> : null}
        </span>
        <MobileNav />
      </div>
    </header>
  );
}
