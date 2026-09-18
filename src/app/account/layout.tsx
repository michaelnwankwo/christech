import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_NOTE } from "@/lib/demo/data";

// src/app/account/layout.tsx — server-side auth gate (defense in depth; the
// middleware also guards /account/**) + tab navigation.
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
    <main id="main-content" className="account-wrap">
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
    </main>
  );
}
