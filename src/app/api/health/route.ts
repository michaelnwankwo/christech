// src/app/api/health/route.ts — public, secret-free ops probe.
// Distinguishes live Supabase from the static demo fallback. Returns only a
// project reference, booleans, counts and error codes — never keys or rows.
import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { demoEligible } from "@/lib/demo/policy";
import { databaseUnavailable } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

function projectRef(url: string): string {
  return new URL(url).hostname.split(".")[0] ?? "unknown";
}

export async function GET() {
  const env = getSupabasePublicEnv();
  const unavailable = await databaseUnavailable();
  const snapshot = {
    ok: false as boolean,
    mode: unavailable ? "demo" : env ? "live" : "misconfigured",
    env: {
      supabasePublicEnvConfigured: env !== null,
      supabaseProjectRef: env ? projectRef(env.url) : null,
      demoFallbackAllowed: demoEligible(),
      demoActive: unavailable,
    },
  };

  if (unavailable) {
    const { demoListProductCards } = await import("@/lib/demo/catalog");
    return NextResponse.json(
      {
        ...snapshot,
        ok: true,
        catalog: { activeProducts: demoListProductCards({}).totalCount },
        note: env
          ? "Supabase is configured but unreachable; the deployment is serving the static demo catalog."
          : "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are not configured; the deployment is serving the static demo catalog.",
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
              ? "migrations 0001–0010 not applied on this project"
              : productsError.code === "PGRST204"
                ? "column missing — apply 0008_catalog_cart.sql"
                : undefined,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { error: colError } = await supabase
      .from("products")
      .select("in_stock")
      .limit(1);

    return NextResponse.json(
      {
        ...snapshot,
        ok: true,
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
