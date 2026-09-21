import { Suspense } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/products/ProductGrid";
import { BrandLoader } from "@/components/ui/BrandLoader";
import { FilterPill } from "@/components/products/FilterPill";
import { listProductCards } from "@/lib/catalog/queries";
import { parsePriceBound } from "@/lib/catalog/filters-query";

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
    // Integer-kobo bounds via the shared codec guard (rejects garbage and
    // negatives; the URL stores MINOR units — ₦500,000 typed = min=50000000).
    minNgnMinor: parsePriceBound(sp.min),
    maxNgnMinor: parsePriceBound(sp.max),
    page: Math.max(1, Math.floor(Number(first(sp.page)) || 1)),
  };

  // Distinguish "query threw" (config/DB down — show an ops-facing banner)
  // from "query returned zero rows" (filters legitimately matched nothing):
  // both used to render the same misleading "No products match" state,
  // which cost a full debugging round on the live deploy.
  let loadError: string | null = null;
  let result: Awaited<ReturnType<typeof listProductCards>> | null = null;
  try {
    result = await listProductCards(parsedFilters);
  } catch (e) {
    loadError = (e as Error)?.message ?? "catalog_unavailable";
  }
  // Fixed precedence: the old `category ? 1 : 0 + …` expression only ever
  // counted the category. Every filter group contributes its real share.
  const activeCount =
    (parsedFilters.category ? 1 : 0) +
    parsedFilters.brand.length +
    parsedFilters.usage.length +
    (parsedFilters.availableOnly ? 1 : 0) +
    (parsedFilters.minNgnMinor !== undefined ||
    parsedFilters.maxNgnMinor !== undefined
      ? 1
      : 0);

  return (
    <>
      <div className="products-header">
        <h1 className="page-title">
          Products
          <span className="products-header__meta">
            {result?.totalCount != null
              ? ` · ${result.totalCount} item${result.totalCount === 1 ? "" : "s"}`
              : ""}
            {activeCount
              ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"}`
              : ""}
          </span>
        </h1>
        <FilterPill activeCount={activeCount} />
      </div>

      {/* Suspense keeps this boundary independent of the route-level
          loading.tsx: on streamed requests the branded skeleton grid paints
          with the shell and swaps in place (same .product-grid tiers). */}
      {loadError ? (
        <div className="banner banner--error" role="alert">
          The catalog data layer is unavailable right now — this is not a
          filter problem. Site operators: check{" "}
          <code>/api/health</code> and the deployment environment variables.
        </div>
      ) : null}

      <Suspense fallback={<BrandLoader variant="skeleton" count={12} />}>
        <ProductGrid cards={result?.cards ?? []} />
      </Suspense>

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
