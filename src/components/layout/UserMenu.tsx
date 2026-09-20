"use client";

// src/components/layout/UserMenu.tsx
// Supabase Auth owns the session (blueprint §2.1); this menu only READS it
// and links to the account area. Role changes are never offered here — by
// policy AND by database trigger the browser could not perform one anyway.
//
// The mobile drawer's account entry moved to MobileProfileRow (a labeled
// row, not a lone avatar) — this component is now the desktop header chip.

import Link from "next/link";
import { useSession } from "@/components/providers/Providers";

/**
 * MobileProfileRow — the drawer's account entry: icon + explicit "My
 * profile" text (→ /account) instead of the old unlabeled avatar badge.
 * Signed-out visitors get the same row inviting them to sign in. Sign out
 * stays available as the trailing ghost action.
 */
export function MobileProfileRow() {
  const { user, profile, loading, signOut } = useSession();

  if (loading) {
    return <span className="chip" aria-busy="true">…</span>;
  }

  if (!user) {
    return (
      <Link className="mobile-nav__profile" href="/login">
        <span className="user-avatar user-avatar--ghost" aria-hidden="true">
          ↪
        </span>
        <span className="mobile-nav__profile-text">
          <b>Sign in</b>
          <span className="muted">Orders, profile &amp; service requests</span>
        </span>
        <span className="mobile-nav__profile-go" aria-hidden="true">
          ›
        </span>
      </Link>
    );
  }

  const label =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Account";
  return (
    <span className="mobile-nav__profile-row">
      <Link className="mobile-nav__profile" href="/account">
        <span className="user-avatar" aria-hidden="true">
          {initialOf(label)}
        </span>
        <span className="mobile-nav__profile-text">
          <b>My profile</b>
          <span className="muted">{user.email ?? "Account & orders"}</span>
        </span>
        <span className="mobile-nav__profile-go" aria-hidden="true">
          ›
        </span>
      </Link>
      <button
        type="button"
        className="btn btn--ghost btn--sm mobile-nav__signout"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </span>
  );
}

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
