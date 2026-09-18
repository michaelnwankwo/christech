// src/lib/supabase/config.ts
// Env guards so a missing or placeholder .env.local produces an ACTIONABLE
// error (or a graceful pass-through in middleware) instead of an opaque
// "Invalid URL" deep inside supabase-js — which used to crash requests and
// surface to the browser as an aborted RSC stream ("Connection closed").

export type SupabasePublicEnv = { url: string; anonKey: string };

const HELP =
  "Fix: set NEXT_PUBLIC_SUPABASE_URL (must be a real URL like " +
  "https://<project-ref>.supabase.co — placeholder text does not work) and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart `npm run dev`. " +
  "See docs/ENVIRONMENT_SETUP_WINDOWS.md.";

/** Returns a parsed origin only for absolute http(s) URLs; null for placeholders/junk. */
export function parseHttpOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!parseHttpOrigin(url)) return null;
  return { url, anonKey };
}

export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(`Supabase is not configured. ${HELP}`);
  }
  return env;
}
