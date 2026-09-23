import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

async function loadCategories() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("categories")
    .select("slug, name")
    .order("sort_order");
  return (data ?? []) as { slug: string; name: string }[];
}

export default async function NewProductPage() {
  const categories = await loadCategories().catch(() => []);
  return (
    <section style={{ marginTop: "1.25rem", maxWidth: 720 }}>
      <p style={{ margin: 0 }}><Link href="/admin/products">← Catalog</Link></p>
      <h1 className="page-title">New product</h1>
      <ProductForm categories={categories} />
    </section>
  );
}
