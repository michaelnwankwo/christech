"use client";

// src/components/account/ProfileForm.tsx — profile fields only. `role` is
// NOT in the payload; even if a tampered client added it, the
// protect_user_identity trigger rejects the change (verified in db-verify A).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useSession } from "@/components/providers/Providers";

export function ProfileForm(props: {
  initial: { full_name: string; phone: string };
}) {
  const router = useRouter();
  const { demo } = useSession();
  const [fullName, setFullName] = useState(props.initial.full_name);
  const [phone, setPhone] = useState(props.initial.phone);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    if (demo) {
      // Demo session: validate + acknowledge locally, persist nothing.
      setBusy(false);
      setSaved(true);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expired — sign in again.");
      setBusy(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", user.id);

    setBusy(false);
    if (updateError) {
      setError("Could not save. Please retry.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="stack" aria-label="Edit profile">
      <div className="field">
        <label htmlFor="profile-name">Full name</label>
        <input
          id="profile-name"
          value={fullName}
          maxLength={120}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="profile-phone">Phone</label>
        <input
          id="profile-phone"
          value={phone}
          maxLength={32}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+234…"
        />
      </div>
      {error ? <p className="banner banner--error" role="alert">{error}</p> : null}
      {saved ? (
        <p className="banner banner--info" role="status">
          {demo ? "Saved in this browser (demo — database offline)." : "Saved."}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
