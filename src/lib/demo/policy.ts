// src/lib/demo/policy.ts
// Demo-mode policy — EDGE-SAFE by design (no server-only import, no
// next/headers, no React). Imported by BOTH middleware (edge runtime) and
// server modules. The fail-safe rule: production without DEMO_FALLBACK=1
// never serves mock data; everything else treats "database unreachable"
// as "render the offline catalog."

import { getSupabasePublicEnv } from "@/lib/supabase/config";

/** Synthetic caller id used by demo-mode requests (never a real row). */
export const DEMO_USER_ID = "de400000-de40-4000-8000-000000000001";

export function demoOptIn(): boolean {
  return process.env.DEMO_FALLBACK === "1";
}

/** Is falling back to demo data ALLOWED in this environment at all? */
export function demoEligible(): boolean {
  return process.env.NODE_ENV !== "production" || demoOptIn();
}

export function supabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
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
