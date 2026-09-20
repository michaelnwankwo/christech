"use client";

// src/components/layout/UserMenu.tsx
// Supabase Auth owns the session (blueprint §2.1); this menu only READS it
// and links to the account area. Role changes are never offered here — by
// policy AND by database trigger the browser could not perform one anyway.
//
// Desktop renders the profile PILL (avatar icon + display name + caret) that
// replaced the old "Demo Shopper" text chip; the mobile drawer's account
// entry is MobileProfileRow below. The stale `compact` branch is deleted —
// MobileNav has not used it since the drawer gained its labeled row.

import Link from "next/link";
import { useSession } from "@/components/providers/Providers";

function UserIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </svg>
  );
}

function CaretDown() {
  return (
    <svg
      className="usermenu-pill__caret"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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

export function UserMenu() {
  const { user, profile, loading, signOut } = useSession();

  if (loading) {
    return <span className="chip" aria-busy="true">…</span>;
  }

  if (!user) {
    return (
      <span className="row" style={{ gap: ".4rem" }}>
        <Link className="usermenu-pill" href="/login">
          <UserIcon />
          Sign in
          <CaretDown />
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
    <span className="row" style={{ gap: ".45rem" }}>
      <Link className="usermenu-pill" href="/account" title={user.email ?? ""}>
        <UserIcon />
        <span className="usermenu-pill__name">{label}</span>
        {profile?.role && profile.role !== "customer" ? (
          <span className="usermenu-pill__role" aria-label={`role: ${profile.role}`}>
            {profile.role}
          </span>
        ) : null}
        <CaretDown />
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
