// src/lib/demo/mode.ts
// Server-side demo-layer API: the React-cached, per-request health probe +
// the withDemoFallback wrapper used by queries and route handlers.
// (Edge-safe primitives live in ./policy.ts — middleware imports those, not
// this module, because next/headers + React cache are unavailable to it.)

import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  demoActive,
  demoEligible,
  probeDatabaseUnavailable,
  supabaseConfigured,
} from "@/lib/demo/policy";

export {
  DEMO_USER_ID,
  demoActive,
  demoEligible,
  demoOptIn,
  supabaseConfigured,
} from "@/lib/demo/policy";

/**
 * Request-scoped, never-throws probe. React `cache` ⇒ at most one probe per
 * request even when the layout, pages, and an API route all ask.
 */
export const databaseUnavailable = cache(async (): Promise<boolean> => {
  // Keys absent ⇒ demo everywhere (policy rule 1), even in production.
  if (!supabaseConfigured()) return true;
  if (!demoEligible()) return false;
  try {
    const supabase = await createServerSupabaseClient();
    return await probeDatabaseUnavailable(supabase);
  } catch {
    return true; // client creation failed (bad env mid-request) — degrade
  }
});

/**
 * Run a DB-backed query; on failure, fall back to the demo implementation
 * when the environment permits it. Rethrows otherwise (prod integrity).
 */
export async function withDemoFallback<T>(
  run: () => Promise<T>,
  demoFallback: () => T
): Promise<T> {
  // Staging skeleton with no keys: mock data instead of a config throw —
  // this is what makes a fresh Netlify deploy show the local demo catalog.
  if (!supabaseConfigured()) return demoFallback();
  if (!demoEligible()) return run();
  if (await databaseUnavailable()) return demoFallback();
  try {
    return await run();
  } catch {
    // DB flipped to down mid-request (or the query timed out): degrade —
    // but re-verify via the (cached, single) probe before trusting it.
    if (await databaseUnavailable()) return demoFallback();
    throw new Error("catalog_unavailable");
  }
}
