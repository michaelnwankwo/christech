import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatMinorMoney } from "@/lib/currency/money";
import { toggleActiveAction, deleteProductAction } from "./actions";
import { ProductRowActions } from "@/components/admin/ProductRowActions";

export const dynamic = "force-dynamic";

async function loadProducts() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, sku, slug, name, brand, category, unit_price_minor, inventory_qty, in_stock, is_active, image_urls"
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export default async function AdminProductsPage() {
  // The layout already gated staff+live-mode; a defensive refetch failure
  // simply renders the empty state rather than throwing.
  const products = await loadProducts().catch(() => []);

  return (
    <section style={{ marginTop: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Catalog</h1>
        <Link className="btn" href="/admin/products/new">+ New product</Link>
      </div>

      {products.length === 0 ? (
        <p className="muted" style={{ marginTop: "1rem" }}>
          No products yet — create the first one.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", fontSize: ".9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-subtle, #ccc)" }}>
              <th style={{ padding: ".45rem .4rem" }}>Product</th>
              <th style={{ padding: ".45rem .4rem" }}>Category</th>
              <th style={{ padding: ".45rem .4rem", textAlign: "right" }}>Price (₦)</th>
              <th style={{ padding: ".45rem .4rem", textAlign: "right" }}>Stock</th>
              <th style={{ padding: ".45rem .4rem" }}>State</th>
              <th style={{ padding: ".45rem .4rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={String(p.id)} style={{ borderBottom: "1px dashed var(--border-subtle, #ddd)" }}>
                <td style={{ padding: ".45rem .4rem" }}>
                  <strong>{String(p.name)}</strong>
                  <div className="muted" style={{ fontSize: ".78rem" }}>
                    {String(p.sku)} · {String(p.brand)} · {(p.image_urls as string[])?.length ?? 0} image(s)
                  </div>
                </td>
                <td style={{ padding: ".45rem .4rem" }}>{String(p.category)}</td>
                <td style={{ padding: ".45rem .4rem", textAlign: "right" }} className="mono">
                  {formatMinorMoney(Number(p.unit_price_minor), "NGN")}
                </td>
                <td style={{ padding: ".45rem .4rem", textAlign: "right" }}>
                  {p.in_stock ? `${p.inventory_qty}` : <span className="muted">0</span>}
                </td>
                <td style={{ padding: ".45rem .4rem" }}>
                  {p.is_active ? "Live" : <span className="muted">Hidden</span>}
                </td>
                <td style={{ padding: ".45rem .4rem" }}>
                  <ProductRowActions
                    id={String(p.id)}
                    isActive={Boolean(p.is_active)}
                    toggleAction={toggleActiveAction}
                    deleteAction={deleteProductAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
