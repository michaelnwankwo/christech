// src/stores/toast-store.ts — transient UI notifications (add-to-cart, etc.).
// Same "layout state lives apart from cart math" doctrine as the storefront
// store: this is ephemeral, NEVER persisted, and holds no user data beyond
// display strings. Actions are described, not closures: a toast may carry
// `{ run: "open-cart" }` and the Toaster resolves it against the storefront
// store — keeping the store serializable and testable.

import { create } from "zustand";

export type ToastAction = { label: string; run: "open-cart" };

export type Toast = {
  id: string;
  title: string;
  body?: string;
  tone: "default" | "warn";
  thumbUrl?: string;
  action?: ToastAction;
};

const MAX_TOASTS = 3;

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "tone"> & { tone?: Toast["tone"] }) => void;
  dismiss: (id: string) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-(MAX_TOASTS - 1)),
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tone: "default",
          ...t,
        } as Toast,
      ],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
