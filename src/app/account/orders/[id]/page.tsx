import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_ORDERS } from "@/lib/demo/data";
import { OrderTimeline } from "@/components/account/OrderTimeline";
import { formatMinorMoney } from "@/lib/currency/money";
import type { Currency } from "@/types/catalog";

export const dynamic = "force-dynamic";

// §16 realtime tracking page. Initial state is server-rendered (RLS:
// owner-or-staff); subsequent updates flow through Supabase Realtime.
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  if (await databaseUnavailable()) {
    const fallbackOrder = DEMO_ORDERS[0];
    if (!fallbackOrder) notFound();
    const demoOrder = DEMO_ORDERS.find((o) => o.id === id) ?? fallbackOrder;
    return (
      <div className="checkout-grid" style={{ alignItems: "start" }}>
        <section className="surface-card" style={{ padding: "1.1rem" }}>
          <p style={{ margin: 0 }}>
            <Link href="/account/orders" className="muted">← All orders</Link>
          </p>
          <h2 style={{ margin: ".4rem 0" }} className="mono">
            {demoOrder.order_number}
          </h2>
          <p className="banner banner--info" style={{ margin: ".4rem 0" }} role="status">
            Demo order — shown from the offline catalog while the database is
            unreachable. Nothing here is persisted.
          </p>
          <div className="cart-totals" style={{ marginTop: ".6rem" }}>
            <div className="row">
              <span>Subtotal</span>
              <span className="mono">
                {formatMinorMoney(demoOrder.subtotal_display_minor, demoOrder.display_currency as Currency)}
              </span>
            </div>
            <div className="row">
              <span>Shipping</span>
              <span className="mono">
                {formatMinorMoney(demoOrder.shipping_display_minor, demoOrder.display_currency as Currency)}
              </span>
            </div>
            <div className="row" style={{ fontWeight: 800 }}>
              <span>Total</span>
              <span className="mono">
                {formatMinorMoney(demoOrder.total_display_minor, demoOrder.display_currency as Currency)}
              </span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
              Charged in {demoOrder.charge_currency} · zone {demoOrder.shipping_zone}
            </p>
          </div>
          <h3 style={{ margin: "1rem 0 .4rem" }}>Items</h3>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {demoOrder.items.map((item, index) => (
              <li key={index} style={{ fontSize: ".9rem" }}>
                {item.name} × {item.qty} —{" "}
                <span className="mono">
                  {formatMinorMoney(item.qty * item.unit, demoOrder.display_currency as Currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <OrderTimeline
          orderId={demoOrder.id}
          initialStatus={demoOrder.status}
          initialPaymentStatus={demoOrder.payment_status}
          initialEvents={demoOrder.events.map((event) => ({
            id: event.id,
            eventType: event.event_type,
            fromStatus: event.from_status,
            toStatus: event.to_status,
            createdAt: event.created_at,
          }))}
        />
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("created_at");

  const { data: events } = await supabase
    .from("order_events")
    .select("id, event_type, from_status, to_status, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="checkout-grid" style={{ alignItems: "start" }}>
      <section className="surface-card" style={{ padding: "1.1rem" }}>
        <p style={{ margin: 0 }}>
          <Link href="/account/orders" className="muted">
            ← All orders
          </Link>
        </p>
        <h2 style={{ margin: ".4rem 0" }} className="mono">
          {String(order.order_number)}
        </h2>

        <div className="cart-totals" style={{ marginTop: ".6rem" }}>
          <div className="row">
            <span>Subtotal</span>
            <span className="mono">
              {formatMinorMoney(
                Number(order.subtotal_display_minor),
                order.display_currency as Currency
              )}
            </span>
          </div>
          <div className="row">
            <span>Shipping</span>
            <span className="mono">
              {formatMinorMoney(
                Number(order.shipping_display_minor),
                order.display_currency as Currency
              )}
            </span>
          </div>
          <div className="row" style={{ fontWeight: 800 }}>
            <span>Total</span>
            <span className="mono">
              {formatMinorMoney(
                Number(order.total_display_minor),
                order.display_currency as Currency
              )}
            </span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
            Charged in {String(order.charge_currency)} · zone{" "}
            {String(order.shipping_zone)}
          </p>
        </div>

        <h3 style={{ margin: "1rem 0 .4rem" }}>Items</h3>
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {(items ?? []).map((item) => (
            <li key={String(item.id)} style={{ fontSize: ".9rem" }}>
              {String(item.name_snapshot)} × {Number(item.quantity)} —{" "}
              <span className="mono">
                {formatMinorMoney(
                  Number(item.line_total_display_minor),
                  order.display_currency as Currency
                )}
              </span>
              {item.sku_snapshot ? (
                <span className="muted"> ({String(item.sku_snapshot)})</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <OrderTimeline
        orderId={String(order.id)}
        initialStatus={String(order.status)}
        initialPaymentStatus={String(order.payment_status)}
        initialEvents={(events ?? []).map((event) => ({
          id: String(event.id),
          eventType: String(event.event_type),
          fromStatus: (event.from_status as string | null) ?? null,
          toStatus: (event.to_status as string | null) ?? null,
          createdAt: String(event.created_at),
        }))}
      />
    </div>
  );
}
