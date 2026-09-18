import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductDetail } from "@/lib/catalog/queries";
import { AddToCartButton } from "@/components/products/AddToCartButton";
import { CurrencyPrice } from "@/components/products/CurrencyPrice";
import { formatMinorMoney } from "@/lib/currency/money";

export const dynamic = "force-dynamic";

// §10.2 product detail — with the add-on picker wired to the cart store.
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductDetail(slug).catch(() => null);
  if (!product) notFound();

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link href="/products" className="muted">
          ← All products
        </Link>
      </p>

      <div className="detail-grid">
        <section className="detail-media surface-card" aria-label="Product media">
          {product.imageUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrls[0]} alt={product.name} />
          ) : (
            <span className="muted">{product.brand} · {product.sku}</span>
          )}
        </section>

        <section className="stack">
          <div className="detail-buy surface-card">
            <div className="product-card__meta">
              <span className="chip">{product.brand}</span>
              <span className="chip">{product.category}</span>
              {product.usageTags.map((tag) => (
                <span key={tag} className="chip chip--primary">
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="page-title" style={{ margin: 0 }}>
              {product.name}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>
              SKU {product.sku}
            </p>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <CurrencyPrice amountMinor={product.unitPriceMinor} />
              {product.inventoryQty > 0 ? (
                <span className="chip chip--success">
                  {product.inventoryQty} in stock
                </span>
              ) : (
                <span className="chip chip--danger">Out of stock</span>
              )}
            </div>

            {product.description ? <p style={{ margin: 0 }}>{product.description}</p> : null}

            <AddToCartButton
              withAddonPicker
              product={{
                id: product.id,
                name: product.name,
                sku: product.sku,
                unitPriceMinor: product.unitPriceMinor,
                shippingClass: product.shippingClass,
                disabled: product.inventoryQty <= 0,
              }}
              addons={product.availableAddons}
            />

            <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
              Add-on services attach to the product line in your cart. Shipping
              ({product.shippingClass} class) is quoted server-side after you
              enter an address. Need an engineer instead?{" "}
              <Link href="/services">Book a service</Link> — bookings stay
              separate from orders.
            </p>
            <span className="muted" style={{ fontSize: ".75rem" }}>
              Base price {formatMinorMoney(product.unitPriceMinor, "NGN")}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
