import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_NOTE } from "@/lib/demo/data";

// src/app/account/layout.tsx — server-side auth gate (defense in depth; the
// middleware also guards /account/**) + tab navigation.
//
// The account area previously rendered a bare <main> — no header, no logo,
// no hamburger: users landed on an isolated view with no way back except the
// browser. It now mounts the standard AppShell (SiteHeader with BrandLogo →
// home, cart trigger, MobileNav hamburger, footer) plus an explicit Back
// control top-left. AppShell owns <main id="main-content">, so the section
// below is a plain div — nested <main> is invalid HTML.
//
// Offline demo: when the database is unreachable in a demo-eligible
// environment (see src/lib/demo/mode.ts), the gate opens on demo rows so
// every account view is testable — clearly labelled, never silent.
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = await databaseUnavailable();
  if (!demo) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=/account");
  }

  return (
    <AppShell mode="storefront">
      <div className="account-wrap">
      <Link
        className="btn btn--ghost btn--sm account-back"
        href="/"
        aria-label="Back to the storefront"
      >
        ← Back
      </Link>
      <h1 className="page-title">My account</h1>
      {demo ? (
        <p className="banner banner--info" role="status">
          Demo account · {DEMO_NOTE}
        </p>
      ) : null}
      <nav className="row" aria-label="Account sections">
        <Link className="btn btn--sm btn--secondary" href="/account">
          Profile
        </Link>
        <Link className="btn btn--sm btn--secondary" href="/account/orders">
          Orders
        </Link>
        <Link className="btn btn--sm btn--secondary" href="/account/service-requests">
          Service requests
        </Link>
      </nav>
      {children}
      </div>
    </AppShell>
  );
}
