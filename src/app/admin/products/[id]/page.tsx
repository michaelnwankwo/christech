import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const [{ data: product }, { data: cats }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, slug, name, description, brand, category, usage_tags, image_urls, unit_price_minor, inventory_qty, shipping_class, is_active"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categories").select("slug, name").order("sort_order"),
  ]);
  if (!product) notFound();

  return (
    <section style={{ marginTop: "1.25rem", maxWidth: 720 }}>
      <p style={{ margin: 0 }}><Link href="/admin/products">← Catalog</Link></p>
      <h1 className="page-title">Edit product</h1>
      <ProductForm
        categories={(cats ?? []) as { slug: string; name: string }[]}
        product={{
          id: String(product.id),
          sku: String(product.sku),
          slug: String(product.slug),
          name: String(product.name),
          description: (product.description as string | null) ?? "",
          brand: String(product.brand),
          category: String(product.category),
          priceNaira: String(Number(product.unit_price_minor) / 100),
          inventoryQty: Number(product.inventory_qty),
          shippingClass: String(product.shipping_class),
          usageTags: ((product.usage_tags as string[] | null) ?? []).join(", "),
          imageUrls: (product.image_urls as string[]) ?? [],
          isActive: Boolean(product.is_active),
        }}
      />
    </section>
  );
}
