// src/stores/storefront-store.ts
// Layout/UI state for the shell: active app mode, cart drawer, sidebar.
// Kept SEPARATE from persisted cart data (§7.1 state ownership matrix) so a
// corrupted drawer state can never poison checkout math.

import { create } from "zustand";
import type { AppMode } from "@/stores/cart-store";

type StorefrontState = {
  cartOpen: boolean;
  sidebarOpen: boolean;
  mode: AppMode;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMode: (mode: AppMode) => void;
};

export const useStorefrontStore = create<StorefrontState>()((set) => ({
  cartOpen: false,
  sidebarOpen: false,
  mode: "storefront",

  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
  toggleCart: () => set((s) => ({ cartOpen: !s.cartOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  // Mode lives in both stores by design: cart-store owns the persisted
  // preference (partialize includes `mode`), this store drives the shell.
  setMode: (mode) => set({ mode, cartOpen: false }),
}));
