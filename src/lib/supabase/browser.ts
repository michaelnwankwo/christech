// src/lib/supabase/browser.ts
// Blueprint §6.2 — browser client verbatim (cookie-managed by @supabase/ssr).
import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/supabase/config";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
