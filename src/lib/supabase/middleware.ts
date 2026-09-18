// src/lib/supabase/middleware.ts
// Session refresh + route guards for the Supabase SSR cookie flow.
// - Always: refresh the auth token (sets cookies on the response).
// - /account/** requires a session (blueprint §2.1: Supabase Auth owns auth).
// - /login + /signup bounce already-signed-in users to the storefront.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { probeDatabaseUnavailable } from "@/lib/demo/policy";

const PROTECTED_PREFIXES = ["/account"];
const AUTH_PAGES = ["/login", "/signup"];

export async function updateSession(request: NextRequest, cspHeader?: string) {
  // Supported way to change forwarded headers: copy, mutate the copy, and
  // hand it to NextResponse.next({ request: { headers } }). Copy happens
  // lazily so cookie mutations from setAll() below are included.
  const passthrough = (): NextResponse => {
    const headers = new Headers(request.headers);
    if (cspHeader) headers.set("Content-Security-Policy", cspHeader);
    return NextResponse.next({ request: { headers } });
  };

  let response = passthrough();

  const env = getSupabasePublicEnv();
  if (!env) {
    // Misconfigured/missing .env.local: pass the request through instead of
    // throwing inside supabase-js. Pages that genuinely need Supabase will
    // surface a clear "Supabase is not configured" error via
    // requireSupabasePublicEnv(); the dev server stays alive and the
    // browser never sees an aborted RSC stream.
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = passthrough();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (not getSession()) validates against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    // Demo layer: when the database is unreachable in a demo-eligible
    // environment, the /account pages themselves render offline data with a
    // banner — so the guard must not bounce them to /login first. The probe
    // embeds the policy check: healthy prod returns false immediately.
    if (await probeDatabaseUnavailable(supabase)) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
