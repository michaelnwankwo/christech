"use client";

// src/components/sidebar/OrderActivity.tsx
// §9.1 section 3: Live Order Tracking + Recent Transactions, fed ONLY by
// RLS-scoped reads of the signed-in customer's rows (§16.3 final note).
// When the customer is anonymous we render a quiet sign-in hint — never an
// error, never someone else's data.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useSession } from "@/components/providers/Providers";
import { formatMinorMoney } from "@/lib/currency/money";
import { ORDER_STATUS_LABELS, type OrderSummary } from "@/types/checkout";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import type { Currency } from "@/types/catalog";

type TrackedOrder = OrderSummary & { id: string };

export function LiveOrderTracking() {
  const { user } = useSession();
  const [current, setCurrent] = useState<TrackedOrder | null>(null);

  useEffect(() => {
    if (!user) {
      setCurrent(null);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    let active = true;

    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, payment_status, display_currency, total_display_minor, created_at"
        )
        .in("status", ["pending_payment", "payment_review", "paid", "processing", "shipped"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && data) {
        setCurrent({
          id: String(data.id),
          orderNumber: String(data.order_number),
          status: data.status as OrderSummary["status"],
          paymentStatus: data.payment_status as OrderSummary["paymentStatus"],
          displayCurrency: data.display_currency as Currency,
          totalDisplayMinor: Number(data.total_display_minor),
          createdAt: String(data.created_at),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  // Realtime refinement for the open order (§16).
  useOrderRealtime(current?.id ?? "", (patch) => {
    setCurrent((prev) =>
      prev
        ? {
            ...prev,
            status: (patch.status as OrderSummary["status"]) ?? prev.status,
            paymentStatus:
              (patch.payment_status as OrderSummary["paymentStatus"]) ??
              prev.paymentStatus,
          }
        : prev
    );
  }, Boolean(current?.id));

  if (!user) {
    return (
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Sign in to track orders in real time.
      </p>
    );
  }

  if (!current) {
    return (
      <p className="muted" style={{ fontSize: ".85rem" }}>
        No active orders right now.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: ".3rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link href={`/account/orders/${current.id}`} className="mono">
          {current.orderNumber}
        </Link>
        <StatusChip order={current} />
      </div>
      <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>
        {formatMinorMoney(current.totalDisplayMinor, current.displayCurrency)} ·{" "}
        {current.paymentStatus === "paid"
          ? "payment confirmed"
          : `payment: ${current.paymentStatus}`}
      </p>
    </div>
  );
}

export function RecentTransactions() {
  const { user } = useSession();
  const [recent, setRecent] = useState<TrackedOrder[]>([]);

  useEffect(() => {
    if (!user) {
      setRecent([]);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    let active = true;

    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, payment_status, display_currency, total_display_minor, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(4);

      if (active) {
        setRecent(
          (data ?? []).map((row) => ({
            id: String(row.id),
            orderNumber: String(row.order_number),
            status: row.status as OrderSummary["status"],
            paymentStatus: row.payment_status as OrderSummary["paymentStatus"],
            displayCurrency: row.display_currency as Currency,
            totalDisplayMinor: Number(row.total_display_minor),
            createdAt: String(row.created_at),
          }))
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  if (recent.length === 0) return null;

  return (
    <table className="order-table" aria-label="Recent transactions">
      <tbody>
        {recent.map((order) => (
          <tr key={order.id}>
            <td>
              <Link href={`/account/orders/${order.id}`} className="mono">
                {order.orderNumber}
              </Link>
            </td>
            <td>{formatMinorMoney(order.totalDisplayMinor, order.displayCurrency)}</td>
            <td>
              <StatusChip order={order} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusChip({ order }: { order: OrderSummary }) {
  const tone =
    order.paymentStatus === "paid"
      ? "chip chip--success"
      : order.status === "payment_review"
        ? "chip chip--danger"
        : order.status === "cancelled"
          ? "chip"
          : "chip chip--primary";

  return (
    <span className={tone}>
      {ORDER_STATUS_LABELS[order.status] ?? order.status}
    </span>
  );
}
