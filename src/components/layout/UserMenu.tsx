"use client";

// src/components/layout/UserMenu.tsx
// Supabase Auth owns the session (blueprint §2.1); this menu only READS it
// and links to the account area. Role changes are never offered here — by
// policy AND by database trigger the browser could not perform one anyway.

import Link from "next/link";
import { useSession } from "@/components/providers/Providers";

export function UserMenu() {
  const { user, profile, loading, signOut } = useSession();

  if (loading) {
    return <span className="chip" aria-busy="true">…</span>;
  }

  if (!user) {
    return (
      <span className="row" style={{ gap: ".4rem" }}>
        <Link className="btn btn--ghost btn--sm" href="/login">
          Sign in
        </Link>
        <Link className="btn btn--sm" href="/signup">
          Create account
        </Link>
      </span>
    );
  }

  const label =
    profile?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";

  return (
    <span className="row" style={{ gap: ".45rem" }}>
      <Link className="chip chip--primary" href="/account" title={user.email ?? ""}>
        {label}
        {profile?.role && profile.role !== "customer" ? (
          <span aria-label={`role: ${profile.role}`}>· {profile.role}</span>
        ) : null}
      </Link>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </span>
  );
}
