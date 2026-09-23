"use client";

// src/app/forgot-password/page.tsx — password recovery REQUEST step.
// resetPasswordForEmail sends Supabase's "Recovery" email whose link lands on
// our /auth/callback (code exchange), which redirects to /update-password
// with the recovery session active. The response is deliberately identical
// whether or not the address exists (no account enumeration).

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setBusy(false);
    if (error) {
      // Only transport/config failures surface here (rate-limit etc.);
      // "user not found" is intentionally masked by Supabase as success.
      if (/rate|frequency/i.test(error.message)) {
        setMessage("Too many requests — wait a minute and try again.");
      } else {
        setMessage("Could not send the reset link. Try again in a moment.");
      }
      return;
    }
    setSent(true);
  }

  return (
    <main id="main-content" className="auth-wrap">
      <form onSubmit={submit} className="surface-card auth-card" aria-label="Reset password">
        <h1 className="page-title">Reset your password</h1>
        <p className="muted" style={{ margin: 0, fontSize: ".88rem" }}>
          Enter the email on your account and we&apos;ll send a secure link to
          choose a new password.
        </p>
        {sent ? (
          <p className="banner banner--info" role="status">
            If an account exists for <strong>{email}</strong>, a reset link is
            on its way. The link expires in one hour.
          </p>
        ) : (
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
        )}
        {message ? (
          <p className="banner banner--error" role="alert">{message}</p>
        ) : null}
        {!sent ? (
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
        ) : null}
        <p style={{ margin: 0, fontSize: ".85rem" }}>
          Remembered it? <Link href="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}
