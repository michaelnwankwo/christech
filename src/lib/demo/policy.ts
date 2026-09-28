// src/lib/demo/policy.ts
// Demo-mode policy — EDGE-SAFE by design (no server-only import, no
// next/headers, no React). Imported by BOTH middleware (edge runtime) and
// server modules. Production is fail-closed: it never serves mock data,
// even if a stale demo flag is present. Demo fallback is development-only.

import { getSupabasePublicEnv } from "@/lib/supabase/config";

/** Synthetic caller id used by demo-mode requests (never a real row). */
export const DEMO_USER_ID = "de400000-de40-4000-8000-000000000001";

const truthy = (v: string | undefined) => v === "1" || v === "true";

export function demoOptIn(): boolean {
  return (
    truthy(process.env.DEMO_FALLBACK) ||
    truthy(process.env.NEXT_PUBLIC_USE_DEMO_DATA) ||
    // server-side alias (bake-free for Netlify runtime envs / containers)
    truthy(process.env.USE_DEMO_DATA)
  );
}

/** Is falling back to demo data ALLOWED in this environment at all?
 * Production always returns false so bad/missing live credentials fail loudly
 * instead of silently routing storefront traffic to static fixtures. */
export function demoEligible(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function supabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}

/** Whether this environment may serve demo data at all. Production is never
 * active; development activates when credentials are absent or a flag opts in. */
export function demoActive(): boolean {
  return demoEligible() && (!supabaseConfigured() || demoOptIn());
}

/** 2.5 s cap — supabase-js has no request timeout of its own. */
export const PROBE_TIMEOUT_MS = 2500;

/**
 * True ⇒ "treat the database as unavailable (and demo mode is allowed)".
 * `client` may be a SupabaseClient (duck-typed so this module stays
 * dependency-free) or null for the unconfigured case.
 */
export async function probeDatabaseUnavailable(
  client: { from: (table: string) => any } | null
): Promise<boolean> {
  if (!demoEligible()) return false;
  if (!client) return true; // Supabase not configured at all

  try {
    const outcome = await Promise.race([
      client.from("products").select("id").limit(1) as PromiseLike<{
        error: unknown | null;
      }>,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("probe_timeout")),
          PROBE_TIMEOUT_MS
        );
        if (typeof timer === "object" && "unref" in timer) timer.unref();
      }),
    ]);
    return Boolean(outcome.error);
  } catch {
    return true;
  }
}
