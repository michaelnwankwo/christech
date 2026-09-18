import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/account/ProfileForm";
import { databaseUnavailable } from "@/lib/demo/mode";
import { DEMO_USER } from "@/lib/demo/data";

export const dynamic = "force-dynamic";

export default async function AccountHomePage() {
  if (await databaseUnavailable()) {
    return (
      <section className="surface-card" style={{ padding: "1.1rem", maxWidth: 560, width: "100%" }}>
        <h2 style={{ margin: 0 }}>Profile (demo)</h2>
        <p className="muted" style={{ fontSize: ".84rem" }}>
          Demo session — the form validates and behaves normally, but edits
          are kept in the browser only while the database is offline.
        </p>
        <ProfileForm initial={{ full_name: DEMO_USER.full_name, phone: "" }} />
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, phone, email, role")
    .eq("id", user!.id)
    .single();

  return (
    <section className="surface-card" style={{ padding: "1.1rem", maxWidth: 560, width: "100%" }}>
      <h2 style={{ margin: 0 }}>Profile</h2>
      <p className="muted" style={{ fontSize: ".84rem" }}>
        Role: <strong>{profile?.role ?? "customer"}</strong> — roles are
        assigned by staff only; this form cannot change it (enforced by a
        database trigger).
      </p>
      <ProfileForm
        initial={{
          full_name: profile?.full_name ?? "",
          phone: profile?.phone ?? "",
        }}
      />
    </section>
  );
}
