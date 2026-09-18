"use client";

// src/app/signup/page.tsx — email+password signup. The database trigger
// on_auth_user_created provisions public.users with role 'customer'; this
// client never sends a role, and even if it did, the trigger + RLS refuse it
// (§2.1 "customer role changes are never accepted from the browser").

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { sanitizeNext } from "@/lib/security/next-param";

export default function SignupPage() {
  return (
    <main id="main-content" className="auth-wrap">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    if (password.length < 8) {
      setMessage("Choose at least 8 characters.");
      setBusy(false);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || null },
        emailRedirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });

    setBusy(false);

    if (error) {
      setMessage(/already/i.test(error.message)
        ? "An account with this email already exists — sign in instead."
        : "Could not create the account. Try again in a moment.");
      return;
    }

    if (data.user && !data.session) {
      setNeedsConfirmation(true);
      return;
    }

    router.replace(sanitizeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={signUp} className="surface-card auth-card" aria-label="Create account">
      <h1 className="page-title">Create your account</h1>
      {needsConfirmation ? (
        <p className="banner banner--info">
          We sent a confirmation link to <strong>{email}</strong>. Open it to
          activate your account, then sign in.
        </p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {message ? (
            <p className="banner banner--error" role="alert">{message}</p>
          ) : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
          <p style={{ margin: 0, fontSize: ".85rem" }}>
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </>
      )}
    </form>
  );
}
