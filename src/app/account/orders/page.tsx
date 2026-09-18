import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_ORDERS } from "@/lib/demo/data";
import { formatMinorMoney } from "@/lib/currency/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/types/checkout";
import type { Currency } from "@/types/catalog";

export const dynamic = "force-dynamic";

export default async function OrdersListPage() {
  if (await databaseUnavailable()) {
    return <OrdersTable rows={DEMO_ORDERS} demo />;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS orders_read_own restricts rows to this user automatically.
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, display_currency, total_display_minor, created_at"
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (orders ?? []).map((o) => ({
    id: String(o.id),
    order_number: String(o.order_number),
    status: o.status as OrderStatus,
    payment_status: String(o.payment_status),
    display_currency: String(o.display_currency) as Currency,
    total_display_minor: Number(o.total_display_minor),
    created_at: String(o.created_at),
  }));

  return <OrdersTable rows={rows} />;
}

type DemoOrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: string;
  display_currency: Currency;
  total_display_minor: number;
  created_at: string;
};

function OrdersTable({ rows, demo }: { rows: DemoOrderRow[]; demo?: boolean }) {
  return (
    <section className="surface-card" style={{ padding: "1rem" }}>
      <h2 style={{ margin: "0 0 .5rem" }}>Orders{demo ? " (demo)" : ""}</h2>
      {rows.length === 0 ? (
        <p className="muted">
          No orders yet. <Link href="/products">Browse the storefront</Link>.
        </p>
      ) : (
        <div className="table-scroll">
        <table className="order-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.order_number}</td>
                <td>
                  {new Date(o.created_at).toLocaleDateString("en-NG", {
                    dateStyle: "medium",
                  })}
                </td>
                <td className="mono">
                  {formatMinorMoney(o.total_display_minor, o.display_currency)}
                </td>
                <td>{ORDER_STATUS_LABELS[o.status] ?? String(o.status)}</td>
                <td>{o.payment_status}</td>
                <td>
                  <Link href={`/account/orders/${o.id}`}>Track →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
