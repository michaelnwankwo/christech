"use client";

// src/components/auth/GoogleSignInButton.tsx
// "Continue with Google" via Supabase's native OAuth (no extra auth
// library). Flow: signInWithOAuth asks Supabase to mint an authorize URL;
// the browser is sent there; Google returns to Supabase; Supabase redirects
// to /auth/callback?code=…&next=… which exchanges the PKCE code for a
// session (server cookies) and lands the user on `next`. The browser never
// chooses where it lands beyond the sanitizeNext-guarded relative path.
//
// Requires (dashboard-side, not code): Supabase → Authentication →
// Providers → Google ENABLED with a Google Cloud OAuth client whose redirect
// URI is https://<project-ref>.supabase.co/auth/v1/callback, plus Site URL
// and Redirect URLs registered under Authentication → URL Configuration.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { sanitizeNext } from "@/lib/security/next-param";

export function GoogleSignInButton({ next }: { next?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Product decision: email+password is the default surface; the OAuth
  // button stays in the tree but hidden until NEXT_PUBLIC_AUTH_GOOGLE_ENABLED
  // ="true" is set at build (i.e. once the Supabase Google provider is
  // configured). Hooks run before this check — constant per build, so hook
  // order never changes between renders.
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") {
    return null;
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const target = sanitizeNext(next);
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
      },
    });
    if (oauthError) {
      setBusy(false);
      setError(
        /provider|not allowed/i.test(oauthError.message)
          ? "Google sign-in isn't enabled on this project yet (Supabase → Authentication → Providers → Google). Use email and password meanwhile."
          : "Google sign-in failed. Try again, or use email and password."
      );
      return;
    }
    if (data.url) {
      // Full page navigation — router.push would skip the IdP round-trip.
      window.location.assign(data.url);
      return;
    }
    // No url means Supabase answered with an already-valid session.
    setBusy(false);
    router.replace(target);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: ".4rem" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: ".6rem",
          color: "var(--color-text-muted, #666)", fontSize: ".75rem",
        }}
        aria-hidden="true"
      >
        <span style={{ flex: 1, borderTop: "1px dashed var(--border-subtle, #ddd)" }} />
        or
        <span style={{ flex: 1, borderTop: "1px dashed var(--border-subtle, #ddd)" }} />
      </div>
      <button
        type="button"
        className="btn"
        style={{ background: "transparent", color: "inherit" }}
        onClick={continueWithGoogle}
        disabled={busy}
      >
        {busy ? "Connecting to Google…" : "Continue with Google"}
      </button>
      {error ? (
        <p className="banner banner--error" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
