"use client";

// src/components/admin/ProductForm.tsx — create/edit form backed by the
// saveProductAction server action (zod validation runs there; the fieldErrors
// it returns are surfaced inline). Images arrive here as an array of public
// storage URLs via <ImageUploader/> and ride into the action as JSON.

import { useActionState } from "react";
import Link from "next/link";
import { PRODUCT_BRANDS } from "@/lib/validation/product-admin";
import { saveProductAction, type AdminActionState } from "@/app/admin/products/actions";
import { ImageUploader } from "./ImageUploader";

export type ProductFormValue = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  priceNaira: string;
  inventoryQty: number;
  shippingClass: string;
  usageTags: string;
  imageUrls: string[];
  isActive: boolean;
};

const EMPTY: Omit<ProductFormValue, "id"> = {
  sku: "",
  slug: "",
  name: "",
  description: "",
  brand: "Other",
  category: "",
  priceNaira: "",
  inventoryQty: 0,
  shippingClass: "standard",
  usageTags: "",
  imageUrls: [],
  isActive: true,
};

export function ProductForm({
  product,
  categories,
}: {
  product?: ProductFormValue;
  categories: { slug: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<AdminActionState | null, FormData>(
    saveProductAction,
    null
  );
  const value = { ...EMPTY, ...product };
  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="surface-card" style={{ padding: "1.25rem", display: "grid", gap: ".85rem" }}>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {state && !state.ok ? (
        <p className="banner banner--error" role="alert">{state.message}</p>
      ) : null}
      {state?.ok ? (
        <p className="banner banner--info" role="status">
          {state.message}{" "}
          <Link href="/admin/products">Back to catalog</Link>
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="pf-name">Name</label>
        <input id="pf-name" name="name" defaultValue={value.name} required maxLength={255} />
        {err("name") ? <span className="muted">{err("name")}</span> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".85rem" }}>
        <div className="field">
          <label htmlFor="pf-sku">SKU</label>
          <input id="pf-sku" name="sku" defaultValue={value.sku} required maxLength={64} />
          {err("sku") ? <span className="muted">{err("sku")}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="pf-slug">URL slug</label>
          <input id="pf-slug" name="slug" defaultValue={value.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          {err("slug") ? <span className="muted">{err("slug")}</span> : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".85rem" }}>
        <div className="field">
          <label htmlFor="pf-brand">Brand</label>
          <select id="pf-brand" name="brand" defaultValue={value.brand}>
            {PRODUCT_BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-category">Category</label>
          <select id="pf-category" name="category" defaultValue={value.category} required>
            <option value="" disabled>Choose…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          {err("category") ? <span className="muted">{err("category")}</span> : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".85rem" }}>
        <div className="field">
          <label htmlFor="pf-price">Unit price (₦)</label>
          <input id="pf-price" name="priceNaira" defaultValue={value.priceNaira} required inputMode="numeric" placeholder="1,850,000" />
          {err("priceNaira") ? <span className="muted">{err("priceNaira")}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="pf-inv">Inventory qty</label>
          <input id="pf-inv" name="inventoryQty" type="number" min={0} defaultValue={value.inventoryQty} />
          <span className="muted" style={{ fontSize: ".72rem" }}>in_stock is derived: qty &gt; 0</span>
        </div>
        <div className="field">
          <label htmlFor="pf-ship">Shipping class</label>
          <input id="pf-ship" name="shippingClass" defaultValue={value.shippingClass} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="pf-tags">Usage tags</label>
        <input id="pf-tags" name="usageTagsRaw" defaultValue={value.usageTags} placeholder="cctv, ip-camera, night-vision" />
        {err("usageTagsRaw") ? <span className="muted">{err("usageTagsRaw")}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="pf-desc">Description</label>
        <textarea id="pf-desc" name="description" rows={4} defaultValue={value.description ?? ""} maxLength={5000} />
      </div>

      <ImageUploaderField initial={value.imageUrls} />

      <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".9rem" }}>
        <input type="checkbox" name="isActive" defaultChecked={value.isActive} />
        Visible in the storefront (uncheck to hide — soft delete)
      </label>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : product ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}

/** Bridges ImageUploader (client interactivity) to the plain-form FormData
 *  contract: the URL array is kept in React state and mirrored into a hidden
 *  JSON field the server action reads. */
function ImageUploaderField({ initial }: { initial: string[] }) {
  return (
    <div className="field">
      <label htmlFor="pf-images">Product images</label>
      <ImageUploader name="imageUrlsJson" defaultValue={initial} id="pf-images" />
    </div>
  );
}
