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
    <div className="detail-page">
      <nav className="detail-crumbs" aria-label="Breadcrumb">
        <Link href="/products">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All products
        </Link>
      </nav>

      <div className="detail-grid">
        <section className="detail-media surface-card" aria-label="Product media">
          {product.imageUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrls[0]} alt={product.name} />
          ) : (
            // No photo in the catalog row: a composed badge beats raw
            // brand/SKU text stretched across an empty box.
            <span className="detail-media__ph">
              <b>{product.brand}</b>
              <span className="mono">{product.sku}</span>
              <span>Photo coming soon</span>
            </span>
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

            <h1 className="detail-title">{product.name}</h1>
            <span className="sku-chip mono">SKU · {product.sku}</span>

            <div className="detail-price-row">
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
                imageUrl: product.imageUrls[0],
                disabled: product.inventoryQty <= 0,
              }}
              addons={product.availableAddons}
            />

            <p className="detail-fine">
              Add-on services attach to the product line in your cart. Shipping
              ({product.shippingClass} class) is quoted server-side after you
              enter an address. Need an engineer instead?{" "}
              <Link href="/services">Book a service</Link> — bookings stay
              separate from orders.
            </p>
            <span className="detail-baseprice">
              Base price {formatMinorMoney(product.unitPriceMinor, "NGN")}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
