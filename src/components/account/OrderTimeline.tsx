"use client";

// src/components/account/OrderTimeline.tsx
// §16.3 ladder + audit trail. Realtime UPDATEs mutate the local status; a
// refetch of order_events runs on every transition so the timeline cannot
// drift from the database (webhook + jobs also insert events).

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/types/checkout";

type TimelineEvent = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
};

const LADDER: OrderStatus[] = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

const EVENT_LABELS: Record<string, string> = {
  created: "Order created — awaiting payment",
  payment_paid: "Payment confirmed",
  payment_failed: "Payment attempt failed",
  payment_mismatch: "Payment flagged for review (amount/currency mismatch)",
  payment_integrity_mismatch: "Payment quarantined (line totals mismatch)",
  expired_unpaid: "Order expired before payment",
  fulfilment_started: "Fulfilment started",
  shipped: "Order shipped",
  delivered: "Order delivered",
};

export function OrderTimeline(props: {
  orderId: string;
  initialStatus: string;
  initialPaymentStatus: string;
  initialEvents: TimelineEvent[];
}) {
  const [status, setStatus] = useState<OrderStatus>(
    props.initialStatus as OrderStatus
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    props.initialPaymentStatus as PaymentStatus
  );
  const [events, setEvents] = useState<TimelineEvent[]>(props.initialEvents);
  const [live, setLive] = useState(false);
  const refetchedFor = useRef<string | null>(null);

  const refreshEvents = useCallback(async () => {
    let supabase;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      return; // offline/demo: keep the server-rendered timeline as-is
    }
    const { data } = await supabase
      .from("order_events")
      .select("id, event_type, from_status, to_status, created_at")
      .eq("order_id", props.orderId)
      .order("created_at", { ascending: true });

    if (data) {
      setEvents(
        data.map((event) => ({
          id: String(event.id),
          eventType: String(event.event_type),
          fromStatus: (event.from_status as string | null) ?? null,
          toStatus: (event.to_status as string | null) ?? null,
          createdAt: String(event.created_at),
        }))
      );
    }
  }, [props.orderId]);

  useOrderRealtime(props.orderId, (patch) => {
    setLive(true);
    if (patch.status) setStatus(patch.status as OrderStatus);
    if (patch.payment_status) {
      setPaymentStatus(patch.payment_status as PaymentStatus);
    }
    const key = `${String(patch.status ?? "")}|${String(patch.payment_status ?? "")}`;
    if (refetchedFor.current !== key) {
      refetchedFor.current = key;
      void refreshEvents();
    }
  });

  // The ?payment=processing hint from the callback flow is UX-only; the real
  // state comes from the server render + realtime above. Nothing here marks
  // payment.
  useEffect(() => {
    const onShow = () => void refreshEvents();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onShow();
    });
  }, [refreshEvents]);

  const reachedIndex = LADDER.indexOf(status);
  const isReview = status === "payment_review";
  const isDead = status === "cancelled" || status === "refunded";

  return (
    <aside className="surface-card" style={{ padding: "1.1rem" }} aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Tracking</h3>
        <span className={live ? "chip chip--success" : "chip"}>
          {live ? "live" : "connecting…"}
        </span>
      </div>

      <div className="track-ladder" role="img" aria-label={`Order status: ${ORDER_STATUS_LABELS[status]}`}>
        {LADDER.map((rung, index) => (
          <span
            key={rung}
            className="rung"
            data-done={!isDead && !isReview && index <= reachedIndex}
            data-state={isReview ? "review" : "ok"}
            title={ORDER_STATUS_LABELS[rung]}
          />
        ))}
      </div>

      <p style={{ margin: ".5rem 0" }}>
        <strong>{ORDER_STATUS_LABELS[status] ?? status}</strong>{" "}
        <span className="muted">· payment {paymentStatus}</span>
      </p>

      {isReview ? (
        <p className="banner banner--error" style={{ fontSize: ".82rem" }}>
          Our team is reviewing a payment discrepancy on this order. No
          fulfillment has occurred; you will be contacted shortly.
        </p>
      ) : null}
      {status === "pending_payment" ? (
        <p className="muted" style={{ fontSize: ".83rem" }}>
          If you already completed the Paystack window, confirmation arrives in
          seconds via webhook. Keep this page open.
        </p>
      ) : null}

      <h4 style={{ margin: ".8rem 0 .4rem" }}>Audit trail</h4>
      <ol className="timeline">
        {events.map((event, index) => (
          <li key={event.id} data-latest={index === events.length - 1}>
            <span className="dot" />
            <span>
              {EVENT_LABELS[event.eventType] ?? event.eventType}
              <br />
              <span className="muted" style={{ fontSize: ".76rem" }}>
                {new Date(event.createdAt).toLocaleString("en-NG")}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
