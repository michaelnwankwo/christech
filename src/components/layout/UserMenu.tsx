"use client";

// src/components/layout/UserMenu.tsx
// Supabase Auth owns the session (blueprint §2.1); this menu only READS it
// and links to the account area. Role changes are never offered here — by
// policy AND by database trigger the browser could not perform one anyway.
//
// `compact` is the mobile-drawer layout: an icon-style account/avatar button
// on the left of its row and Sign out pinned to the far right — no name
// badge (the previous "Demo Shopper"-style chip was redundant with the
// avatar inside a 768px-wide panel). Desktop keeps the full chip + role.

import Link from "next/link";
import { useSession } from "@/components/providers/Providers";

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, profile, loading, signOut } = useSession();

  if (loading) {
    return <span className="chip" aria-busy="true">…</span>;
  }

  if (compact) {
    if (!user) {
      return (
        <span className="usermenu usermenu--compact">
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
      profile?.full_name?.trim() || user.email?.split("@")[0] || "Account";
    return (
      <span className="usermenu usermenu--compact">
        <Link
          className="user-avatar"
          href="/account"
          aria-label={`Account — ${label}`}
          title={label}
        >
          {initialOf(label)}
        </Link>
        <button
          type="button"
          className="btn btn--ghost btn--sm usermenu__signout"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </span>
    );
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

function initialOf(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "A";
}
