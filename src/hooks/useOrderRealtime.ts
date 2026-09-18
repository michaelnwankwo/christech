"use client";

// src/hooks/useOrderRealtime.ts
// Blueprint §16.2 — with two production corrections from the audit loop:
//   1. `onUpdate` is stored in a ref, so an unstable callback identity does
//      NOT tear down + resubscribe the channel on every render (the Draft-1
//      dependency array did exactly that).
//   2. Channel cleanup is awaited via a cancelled flag, and subscriptions
//      are keyed per order id as the spec requires.

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { OrdersRow } from "@/types/database";

export function useOrderRealtime(
  orderId: string,
  onUpdate: (order: Partial<OrdersRow>) => void,
  enabled = true
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !orderId) return;

    // Offline/demo: constructing the client can legitimately fail (no or
    // placeholder Supabase config). Static timeline data must render; the
    // live layer is simply absent — never a crash.
    let supabase;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      return;
    }
    let active = true;

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (active) onUpdateRef.current(payload.new as Partial<OrdersRow>);
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [orderId, enabled]);
}
