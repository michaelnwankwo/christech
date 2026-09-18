// src/middleware.ts — MUST live next to the app directory (`src/app/`).
//
// Two jobs, one request:
//  1. Per-request CSP with a fresh nonce (see src/lib/security/csp.ts for
//     why this MUST live in middleware and not next.config headers()).
//  2. Supabase session refresh + route guards (@supabase/ssr flow).
//
// History: this file previously sat at the project root, where Next.js
// silently never loaded it (middleware is only discovered adjacent to
// pages/ or app/ — check `.next/server/middleware-manifest.json`'s
// `sortedMiddleware` to prove it runs). Root-level middleware also has no
// CSP ⇒ blank page, because Next.js only nonces its inline <script> tags
// when the page render sees a `nonce-` source in the CSP header.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCspHeader, generateNonce } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  // Mint once; the same string goes to the renderer (so Next can attach the
  // nonce to its inline scripts) AND to the browser (so the policy matches).
  const csp = buildCspHeader(generateNonce());

  // updateSession forwards CSP as a REQUEST header on pass-throughs
  // (request.headers is read-only in the middleware runtime; the supported
  // mutation channel is NextResponse.next({ request: { headers } })).
  const response = await updateSession(request, csp);

  // Redirects never carry a body, but setting CSP on them is harmless.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets and the Paystack webhook (it must never be
  // redirected by auth middleware; it authenticates via HMAC instead).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|api/webhooks/).*)",
  ],
};
