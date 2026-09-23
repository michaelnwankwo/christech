"use client";

// src/components/ui/Toaster.tsx — renders the toast stack. Mounted once in
// the AppShell; z-index 80 sits above the cart drawer (60/70) and the sticky
// header (40). Mobile: bottom-center with safe-area padding; ≥640px:
// bottom-right, per the design brief. Each ToastItem owns its 3.5 s timer,
// so unmounting always cleans up; the container is aria-live polite, which
// preserves the screen-reader announcement the old inline feedback span made.

import { useEffect } from "react";
import { useToastStore, type Toast } from "@/stores/toast-store";
import { useStorefrontStore } from "@/stores/storefront-store";

const TOAST_TTL_MS = 3500;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="toaster" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const openCart = useStorefrontStore((s) => s.openCart);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div className={`toast${toast.tone === "warn" ? " toast--warn" : ""}`}>
      {toast.thumbUrl ? (
        // Plain <img>: same rationale as admin previews — no next/image
        // remotePatterns coupling for transient UI.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="toast__thumb" src={toast.thumbUrl} alt="" aria-hidden="true" />
      ) : null}
      <div className="toast__text">
        <strong className="toast__title">{toast.title}</strong>
        {toast.body ? <span className="toast__body">{toast.body}</span> : null}
      </div>
      <div className="toast__actions">
        {toast.action ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              if (toast.action?.run === "open-cart") openCart();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
        <button
          type="button"
          className="toast__close"
          aria-label="Dismiss notification"
          onClick={() => dismiss(toast.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
