// src/lib/supabase/admin.ts
// Blueprint §6.2 — service-role client. Bypasses RLS: ONLY importable from
// server code. The `server-only` package makes any accidental import into a
// Client Component a BUILD FAILURE, not a runtime bug (§6.2 mandate).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseHttpOrigin } from "@/lib/supabase/config";

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || !parseHttpOrigin(url)) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL (a valid URL) " +
        "and SUPABASE_SERVICE_ROLE_KEY in .env.local — see docs/ENVIRONMENT_SETUP_WINDOWS.md."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
