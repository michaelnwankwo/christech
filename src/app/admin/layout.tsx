import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseConfigured, demoActive } from "@/lib/demo/policy";

export const metadata = { title: "Admin — Chrisviscus Technologies", robots: "noindex, nofollow" };
export const dynamic = "force-dynamic";

// Admin layout: one server-side gate for every /admin page (the actions
// re-check independently — see actions.ts). Session → profile role → RLS.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let status: "ok" | "anon" | "not-staff" | "demo" = "ok";

  if (!supabaseConfigured() || demoActive()) {
    status = "demo";
  } else {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      status = "anon";
    } else {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || !["staff", "admin"].includes(String(profile.role))) {
        status = "not-staff";
      }
    }
  }

  return (
    <main id="main-content" style={{ maxWidth: 1080, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "1rem", flexWrap: "wrap", paddingBottom: "1rem",
          borderBottom: "1px dashed var(--border-subtle, #ddd)",
        }}
      >
        <strong>Chrisviscus — Admin</strong>
        <nav style={{ display: "flex", gap: "1rem", fontSize: ".9rem" }}>
          <Link href="/admin/products">Products</Link>
          <Link href="/products">Storefront</Link>
          <Link href="/account">Account</Link>
        </nav>
      </header>

      {status === "demo" ? (
        <p className="banner banner--info" style={{ marginTop: "1rem" }}>
          Admin editing is disabled while the site runs in demo mode. Configure
          Supabase (and clear USE_DEMO_DATA) to manage the live catalog.
        </p>
      ) : status === "anon" ? (
        <div className="surface-card" style={{ marginTop: "2rem", maxWidth: 420, padding: "1.25rem" }}>
          <h1 className="page-title" style={{ marginTop: 0 }}>Staff sign-in required</h1>
          <p className="muted">This area is limited to staff/admin accounts.</p>
          <Link className="btn" href="/login?next=/admin/products">Sign in</Link>{" "}
          <Link href="/signup">Create an account</Link>
        </div>
      ) : status === "not-staff" ? (
        <div className="surface-card" style={{ marginTop: "2rem", maxWidth: 420, padding: "1.25rem" }}>
          <h1 className="page-title" style={{ marginTop: 0 }}>Not a staff account</h1>
          <p className="muted">
            Your account exists but its role is <code>customer</code>. An
            existing admin can promote you (see docs/ADMIN_CATALOG_STORAGE.md),
            then reload this page.
          </p>
          <Link href="/products">Back to the storefront</Link>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
