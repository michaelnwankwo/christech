"use client";

// src/components/layout/AppModeSwitch.tsx
// The two domains are separate experiences; the switch mirrors the mode in
// both stores (cart-store persists the preference; storefront-store drives
// the shell). Navigation is real routing — the mode is never the ONLY
// separator (routes, layouts, and stores are separated too, §2.4).

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useCartStore, type AppMode } from "@/stores/cart-store";
import { useStorefrontStore } from "@/stores/storefront-store";

export function AppModeSwitch() {
  const router = useRouter();
  const pathname = usePathname();

  const setCartMode = useCartStore((s) => s.setMode);
  const mode = useStorefrontStore((s) => s.mode);
  const setShellMode = useStorefrontStore((s) => s.setMode);

  // Route is the source of truth for which shell renders; keep the stores
  // in sync with the ACTIVE route on every navigation.
  useEffect(() => {
    const derived: AppMode = pathname.startsWith("/services")
      ? "service-booking"
      : "storefront";
    if (mode !== derived) {
      setShellMode(derived);
      setCartMode(derived);
    }
  }, [pathname, mode, setShellMode, setCartMode]);

  function switchTo(next: AppMode) {
    if (next === mode) return;
    setShellMode(next);
    setCartMode(next);
    router.push(next === "storefront" ? "/products" : "/services");
  }

  return (
    <div className="mode-switch" role="group" aria-label="Application mode">
      <button
        type="button"
        aria-pressed={mode === "storefront"}
        onClick={() => switchTo("storefront")}
      >
        Store
      </button>
      <button
        type="button"
        aria-pressed={mode === "service-booking"}
        onClick={() => switchTo("service-booking")}
      >
        Book a service
      </button>
    </div>
  );
}
