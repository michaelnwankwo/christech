"use client";

// src/app/update-password/page.tsx — password recovery CONFIRM step.
// Reached only with an active recovery session (Supabase opened the emailed
// link → /auth/callback exchanged the code → redirected here). After
// updateUser we sign the temporary recovery session out and land on /login
// with a status banner, so the user enters the new password through the
// normal flow (fresh cookies, no half-lived recovery session).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { PasswordField } from "@/components/auth/PasswordField";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setSessionReady(Boolean(user));
    });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage("Choose at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("The two entries don't match.");
      return;
    }
    setBusy(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setMessage(
        /same|different/i.test(error.message)
          ? "Pick a password you haven't used on this account before."
          : "Could not update the password. Re-open the reset link (they expire) and try again."
      );
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }

  if (sessionReady === null) {
    return (
      <main id="main-content" className="auth-wrap">
        <p className="muted">Checking your reset link…</p>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main id="main-content" className="auth-wrap">
        <div className="surface-card auth-card" role="alert">
          <h1 className="page-title">This reset link can't be used now</h1>
          <p className="muted">
            Reset links open a short-lived session and expire within an hour.
            Request a fresh one.
          </p>
          <Link className="btn" href="/forgot-password">Send a new reset link</Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-wrap">
      <form onSubmit={submit} className="surface-card auth-card" aria-label="Choose a new password">
        <h1 className="page-title">Choose a new password</h1>
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={setPassword}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={setConfirm}
        />
        {message ? (
          <p className="banner banner--error" role="alert">{message}</p>
        ) : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
