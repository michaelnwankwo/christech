// src/app/api/search/route.ts
// Live catalog search for the header search UI (desktop popover + mobile
// panel). Read-only, public-catalog scoped: only ACTIVE products surface,
// RLS still applies via the anon/authenticated client, and results are
// capped at SEARCH_RESULT_LIMIT. Debounced calls from the header hit this
// with `?q=`; the full results page lives at /products?search=… (server
// query, shareable URL) — this route only powers the instant dropdown.

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clientIp, rateLimitedResponse } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { databaseUnavailable, demoEligible } from "@/lib/demo/mode";
import { demoSearchProducts } from "@/lib/demo/catalog";
import {
  sanitizeSearchQuery,
  SEARCH_MIN_CHARS,
  SEARCH_RESULT_LIMIT,
  type CatalogSearchResult,
} from "@/lib/catalog/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = checkRateLimit("search", clientIp(request));
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const url = new URL(request.url);
  const query = sanitizeSearchQuery(url.searchParams.get("q"));

  // Below the minimum length the dropdown shows nothing — answer fast
  // instead of firing a guaranteed-empty ILIKE at the database.
  if (query.length < SEARCH_MIN_CHARS) {
    return NextResponse.json(
      { results: [] },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // Offline demo path (dev only): same semantics against the static mirror
  // so the header search is fully testable without a database. Production
  // is fail-closed — demoEligible() is false there and this is dead code.
  if (demoEligible() && (await databaseUnavailable())) {
    return NextResponse.json(
      { results: demoSearchProducts(query), demo: true },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const supabase = await createServerSupabaseClient();

  // `query` is already sanitized (no % _ , ( ) * or quotes), so the or=
  // expression below is a fixed grammar with the token embedded safely.
  const like = `%${query}%`;
  const { data, error } = await supabase
    .from("products")
    .select("slug, name, brand, category, sku, unit_price_minor")
    .eq("is_active", true)
    .or(
      `name.ilike.${like},sku.ilike.${like},brand.ilike.${like},category.ilike.${like}`
    )
    .order("name")
    .limit(SEARCH_RESULT_LIMIT);

  if (error) {
    // Never leak connection details; the header UI treats this as "no
    // results" and the full /products search page still works.
    return NextResponse.json(
      { results: [] },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  const results: CatalogSearchResult[] = (data ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    brand: String(row.brand),
    category: String(row.category),
    sku: String(row.sku),
    unitPriceMinor: Number(row.unit_price_minor),
  }));

  return NextResponse.json(
    { results },
    { headers: { "cache-control": "no-store" } }
  );
}
