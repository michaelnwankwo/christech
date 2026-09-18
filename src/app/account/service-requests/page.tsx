import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_SERVICE_REQUESTS } from "@/lib/demo/data";
import { SERVICE_REQUEST_STATUS_LABELS, type ServiceRequestStatus } from "@/types/services";
import { formatMinorMoney } from "@/lib/currency/money";
import type { Currency } from "@/types/catalog";

export const dynamic = "force-dynamic";

// The SERVICE domain's customer view — deliberately has no order/payment
// columns (§11.3 "booking status is not represented as payment status").
export default async function ServiceRequestsPage() {
  if (await databaseUnavailable()) {
    return (
      <section className="surface-card" style={{ padding: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Service requests (demo)</h2>
          <Link className="btn btn--sm" href="/booking">New request</Link>
        </div>
        <div className="table-scroll">
        <table className="order-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Service</th>
              <th>Requested window</th>
              <th>Status</th>
              <th>Staff quote</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_SERVICE_REQUESTS.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.request_number}</td>
                <td>{row.service_name}</td>
                <td>{row.window}</td>
                <td>
                  <span className="chip chip--primary">
                    {SERVICE_REQUEST_STATUS_LABELS[
                      row.status as ServiceRequestStatus
                    ] ?? row.status}
                  </span>
                </td>
                <td className="mono">Pending review</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: requests } = await supabase
    .from("service_requests")
    .select(
      "id, request_number, status, requested_start_at, requested_end_at, estimated_price_minor, currency, notes, created_at, services(name)"
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const rows = requests ?? [];

  return (
    <section className="surface-card" style={{ padding: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Service requests</h2>
        <Link className="btn btn--sm" href="/booking">
          New request
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="muted">
          No bookings yet. <Link href="/services">Browse services</Link> to get
          started — requests never touch the shopping cart.
        </p>
      ) : (
        <div className="table-scroll">
        <table className="order-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Service</th>
              <th>Requested window</th>
              <th>Status</th>
              <th>Staff quote</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const service = row.services as { name?: string } | null;
              const start = row.requested_start_at
                ? new Date(String(row.requested_start_at))
                : null;
              const end = row.requested_end_at
                ? new Date(String(row.requested_end_at))
                : null;
              return (
                <tr key={String(row.id)}>
                  <td className="mono">{String(row.request_number)}</td>
                  <td>{service?.name ?? "—"}</td>
                  <td>
                    {start
                      ? start.toLocaleString("en-NG", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }) +
                        (end
                          ? ` → ${end.toLocaleTimeString("en-NG", {
                              timeStyle: "short",
                            })}`
                          : "")
                      : "Flexible"}
                  </td>
                  <td>
                    <span className="chip chip--primary">
                      {SERVICE_REQUEST_STATUS_LABELS[
                        row.status as ServiceRequestStatus
                      ] ?? String(row.status)}
                    </span>
                  </td>
                  <td className="mono">
                    {row.estimated_price_minor === null ||
                    row.estimated_price_minor === undefined
                      ? "Pending review"
                      : formatMinorMoney(
                          Number(row.estimated_price_minor),
                          (row.currency ?? "NGN") as Currency
                        )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
