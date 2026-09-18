// src/lib/supabase/server.ts
// Blueprint §6.2 — server client verbatim. Session comes from request
// cookies; cookie writes only succeed in Route Handlers / Server Actions,
// which is exactly what @supabase/ssr's try/catch accommodates.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublicEnv } from "@/lib/supabase/config";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values: { name: string; value: string; options: CookieOptions }[]) {
          try {
            values.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component: safe to ignore when middleware
            // refreshes sessions. Never throw during render.
          }
        },
      },
    }
  );
}
