import Link from "next/link";
import { ProductGrid } from "@/components/products/ProductGrid";
import { listProductCards } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic";

// §10.1 + §9.2: every filter arrives via URL query params (shareable,
// back-button friendly): /products?category=networking&brand=Cisco&usage=enterprise

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function list(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;

  const parsedFilters = {
    category: first(sp.category),
    brand: list(sp.brand),
    usage: list(sp.usage),
    availableOnly: sp.available === "1",
    minNgnMinor: Number.isFinite(Number(sp.min)) && sp.min ? Number(sp.min) : undefined,
    maxNgnMinor: Number.isFinite(Number(sp.max)) && sp.max ? Number(sp.max) : undefined,
    page: Math.max(1, Math.floor(Number(first(sp.page)) || 1)),
  };

  const result = await listProductCards(parsedFilters).catch(() => null);
  const activeCount =
    parsedFilters.category ? 1 : 0 +
    parsedFilters.brand.length +
    parsedFilters.usage.length;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Products</h1>
        <span className="muted" style={{ fontSize: ".85rem" }}>
          {result?.totalCount != null ? `${result.totalCount} item(s)` : ""}
          {activeCount ? ` · ${activeCount} filter(s) active` : ""}
        </span>
      </div>

      <ProductGrid cards={result?.cards ?? []} />

      {result && result.totalCount !== null && result.totalCount > result.pageSize ? (
        <nav className="pagination" aria-label="Product pages">
          <Link
            className={`btn btn--sm ${result.page <= 1 ? "" : "btn--secondary"}`}
            aria-disabled={result.page <= 1}
            href={buildHref(sp, result.page - 1)}
          >
            ← Prev
          </Link>
          <span className="chip">
            Page {result.page} of {Math.ceil(result.totalCount / result.pageSize)}
          </span>
          <Link
            className="btn btn--sm btn--secondary"
            href={buildHref(sp, result.page + 1)}
          >
            Next →
          </Link>
        </nav>
      ) : null}
    </>
  );
}

function buildHref(sp: Search, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value && key !== "page") params.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/products${qs ? `?${qs}` : ""}`;
}
