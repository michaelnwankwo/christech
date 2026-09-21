// src/app/api/health/route.ts — public, secret-free ops probe.
// Existence: it distinguishes the two failures that otherwise look
// identical to the storefront ("No products match…"): unconfigured env vs
// a reachable-but-broken/empty database. Returns booleans, counts and
// error CODES only — never keys, never rows, never user data.
import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { demoEligible } from "@/lib/demo/policy";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getSupabasePublicEnv();
  const snapshot = {
    ok: false as boolean,
    env: {
      supabasePublicEnvConfigured: env !== null,
      demoFallbackAllowed: demoEligible(),
    },
  };

  if (!env) {
    return NextResponse.json(
      {
        ...snapshot,
        error:
          "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing or placeholder on this deployment — set them in Netlify and redeploy (NEXT_PUBLIC_* bakes at build time).",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
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
