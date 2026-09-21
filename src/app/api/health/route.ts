// src/app/api/health/route.ts — public, secret-free ops probe.
// Existence: it distinguishes the two failures that otherwise look
// identical to the storefront ("No products match…"): unconfigured env vs
// a reachable-but-broken/empty database. Returns booleans, counts and
// error CODES only — never keys, never rows, never user data.
import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { demoActive, demoEligible } from "@/lib/demo/policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getSupabasePublicEnv();
  const snapshot = {
    ok: false as boolean,
    env: {
      supabasePublicEnvConfigured: env !== null,
      demoFallbackAllowed: demoEligible(),
      demoActive: demoActive(),
    },
  };

  if (!env) {
    // Policy rule 1: no keys ⇒ deliberate staging skeleton serving the
    // offline demo catalog. Still NOT ok:true-as-production — mode:"demo"
    // tells ops exactly why the numbers are mock.
    const { demoListProductCards } = await import("@/lib/demo/catalog");
    return NextResponse.json(
      {
        ...snapshot,
        ok: true,
        mode: "demo",
        catalog: { activeProducts: demoListProductCards({}).totalCount },
        note: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set on this deployment — serving the demo catalog. Set the keys (and optionally NEXT_PUBLIC_USE_DEMO_DATA=false) and redeploy for live data.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { createServerSupabaseClient } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createServerSupabaseClient();

    const { count: activeProducts, error: productsError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (productsError) {
      return NextResponse.json(
        {
          ...snapshot,
          error: `products query failed (${productsError.code ?? "?"}): ${String(
            productsError.message
          ).slice(0, 180)}`,
          hint:
            productsError.code === "42P01"
              ? "migrations 0001–0008 not applied on this project"
              : productsError.code === "PGRST204"
                ? "column missing — apply 0008_catalog_cart.sql"
                : undefined,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Cheap probe of migration 0008's generated column (42703 = not applied).
    const { error: colError } = await supabase
      .from("products")
      .select("in_stock")
      .limit(1);

    return NextResponse.json(
      {
        ok: true,
        env: snapshot.env,
        catalog: {
          activeProducts: activeProducts ?? 0,
          migration0008InStockColumn: colError ? "missing" : "present",
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ...snapshot, error: String((e as Error)?.message ?? e).slice(0, 200) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
