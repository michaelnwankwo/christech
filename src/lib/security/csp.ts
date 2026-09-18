// src/lib/security/csp.ts
// Blueprint §18 — Content-Security-Policy, middleware-driven.
//
// Why middleware and not next.config headers(): Next.js App Router ships
// the RSC "flight" payload as INLINE <script> chunks (self.__next_f.push)
// and injects a bootstrap script into every HTML document. A script-src
// without a matching nonce (or 'unsafe-inline') makes the browser block
// those chunks → hydration dies → BLANK PAGE + "React Server Component
// Stream Error: Connection closed". next.config headers() are static, so
// a nonce has to be generated per request — that is middleware's job.
//
// Mechanism (verified against next@15.5 dist/server/app-render/
// get-script-nonce-from-header.js): Next parses the response's
// Content-Security-Policy header, extracts the first 'nonce-…' source
// from script-src, and automatically attaches that nonce to every script
// tag it renders. We only need to mint the nonce and set the header.
//
// Dev-mode differences:
//  - script-src adds 'unsafe-eval' (react-refresh/webpack eval'd modules).
//  - connect-src adds ws:/wss: — HMR's websocket lives on a different
//    scheme than 'self', so CSP would otherwise block hot reloading.
//  - Dev is localhost-only surface; production is the hardened path.

/** Base64url-safe nonce (Next's extractor only accepts [A-Za-z0-9+/_-] with optional '=' padding). */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Supabase origins the browser may talk to directly (session refresh,
 * auth). The wildcard covers hosted projects; the exact origin is added
 * for self-hosted/local Supabase (e.g. http://127.0.0.1:54321) which the
 * wildcard would not match. Never throws on a placeholder value.
 */
function supabaseConnectSources(): string[] {
  const sources = ["https://*.supabase.co"];
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) {
    try {
      const url = new URL(raw);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.hostname.endsWith(".supabase.co")
      ) {
        sources.push(url.origin);
      }
    } catch {
      // Placeholder/invalid URL in dev — wildcard still covers hosted
      // projects; a clear error surfaces later via lib/supabase/config.
    }
  }
  return sources;
}

export function buildCspHeader(nonce: string): string {
  const dev = isDev();

  const scriptSrc = [
    "'self'",
    // Nonce for Next's own inline flight/bootstrap scripts (prod AND dev —
    // dev keeps 'unsafe-inline' too because some dev-overlay scripts are
    // injected outside the nonce-able template. NOTE: browsers ignore
    // 'unsafe-inline' when a nonce is present, so the nonce path is what
    // actually protects production.)
    `'nonce-${nonce}'`,
    "https://js.paystack.co",
    ...(dev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
  ];

  const connectSrc = [
    "'self'",
    ...supabaseConnectSources(),
    "https://api.paystack.co",
    ...(dev ? ["ws:", "wss:"] : []),
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    // Paystack inline checkout opens an iframe from *.paystack.co.
    "frame-src": ["https://*.paystack.co"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}
