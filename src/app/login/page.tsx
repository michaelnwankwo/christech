"use client";

// src/app/login/page.tsx — Supabase Auth (the blueprint's identity owner).
// Email + password flow; a magic-link alternative is one call away. The
// NEXT_QUERY param returns users to what they were doing (checkout, booking).
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { sanitizeNext } from "@/lib/security/next-param";

export default function LoginPage() {
  return (
    <main id="main-content" className="auth-wrap">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (error) {
      setMessage(error.message === "Invalid login credentials"
        ? "Invalid email or password."
        : "Sign-in failed. Check your connection and try again.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="surface-card auth-card" aria-label="Sign in">
      <h1 className="page-title">Welcome back</h1>
      <p className="muted" style={{ margin: 0, fontSize: ".88rem" }}>
        Orders and service requests are private to your account (enforced by
        row-level security).
      </p>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {message ? (
        <p className="banner banner--error" role="alert">{message}</p>
      ) : null}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p style={{ margin: 0, fontSize: ".85rem" }}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}
