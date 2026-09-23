"use server";

// src/app/admin/products/actions.ts — the ONLY catalog mutation path from
// the admin UI. AuthZ: requireStaff() re-checks public.users.role on EVERY
// action (the page layout's guard only hides the UI; actions are callable
// endpoints). The same is_staff() policy then re-applies at the database via
// RLS — three independent gates, one of them being Postgres itself.
// Money: unit_price_minor comes from parseNairaToMinor of the typed naira
// string; the browser never supplies minor units directly.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo/policy";
import { log } from "@/lib/logging/log";
import {
  parseNairaToMinor,
  normalizeUsageTags,
  productAdminSchema,
  zodFieldErrors,
} from "@/lib/validation/product-admin";

export type AdminActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  savedId?: string;
};

type Staff = { supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> };

async function requireStaff(): Promise<Staff | { denied: AdminActionState }> {
  if (!supabaseConfigured()) {
    return {
      denied: {
        ok: false,
        message:
          "Admin catalog editing is disabled while the site runs in demo mode (no Supabase configured).",
      },
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      denied: {
        ok: false,
        message: "Sign in as a staff member to edit the catalog.",
      },
    };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["staff", "admin"].includes(String(profile.role))) {
    log.warn("admin.denied", { userId: user.id });
    return { denied: { ok: false, message: "Staff access required." } };
  }
  return { supabase };
}

function formString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Hidden <input type="hidden"> JSON from ImageUploader; anything malformed
 *  degrades to [] rather than throwing at parse time. */
function parseImageUrlsJson(raw: string): string[] {
  try {
    const arr: unknown = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export async function saveProductAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const gate = await requireStaff();
  if ("denied" in gate) return gate.denied;
  const { supabase } = gate;

  const raw = {
    ...(formString(formData, "id") ? { id: formString(formData, "id") } : {}),
    sku: formString(formData, "sku"),
    slug: formString(formData, "slug"),
    name: formString(formData, "name"),
    description: formString(formData, "description"),
    brand: formString(formData, "brand"),
    category: formString(formData, "category"),
    priceNaira: formString(formData, "priceNaira"),
    inventoryQty: formString(formData, "inventoryQty") || "0",
    shippingClass: formString(formData, "shippingClass") || "standard",
    usageTagsRaw: formString(formData, "usageTagsRaw"),
    imageUrls: parseImageUrlsJson(formString(formData, "imageUrlsJson")),
    isActive: formData.get("isActive") === "on",
  };

  const parsed = productAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Some fields need attention.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const p = parsed.data;

  const unitPriceMinor = parseNairaToMinor(p.priceNaira);
  if (unitPriceMinor === null) {
    return { ok: false, message: "Invalid price.", fieldErrors: { priceNaira: "Digits only, e.g. 1,850,000 or 18500000.00" } };
  }
  const usageTags = normalizeUsageTags(p.usageTagsRaw ?? "");
  if (usageTags === null) {
    return { ok: false, message: "Invalid usage tags.", fieldErrors: { usageTagsRaw: "≤8 comma-separated tags, lowercase, e.g. cctv, ip-camera" } };
  }

  // products.category is free text in the schema; keep it aligned with the
  // admin-editable public.categories reference table.
  const { data: cats } = await supabase.from("categories").select("slug");
  const known = new Set((cats ?? []).map((c) => String(c.slug)));
  if (!known.has(p.category)) {
    return { ok: false, message: "Unknown category.", fieldErrors: { category: "Pick one of the listed categories." } };
  }

  const row = {
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    brand: p.brand,
    category: p.category,
    usage_tags: usageTags,
    image_urls: p.imageUrls,
    unit_price_minor: unitPriceMinor,
    inventory_qty: p.inventoryQty,
    shipping_class: p.shippingClass,
    is_active: p.isActive,
  };

  const isEdit = Boolean(p.id);
  const query = isEdit
    ? supabase.from("products").update(row).eq("id", p.id as string)
    : supabase.from("products").insert(row);
  const { data, error } = await query.select("id").single();

  if (error) {
    log.warn("admin.save_product_failed", { code: error.code });
    const friendly =
      error.code === "23505"
        ? "Another product already uses this SKU or slug — edit that product instead."
        : "Could not save the product. Please try again.";
    return { ok: false, message: friendly };
  }

  const savedId = String(data?.id ?? p.id ?? "");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  return { ok: true, message: isEdit ? "Product updated." : "Product created.", savedId };
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const gate = await requireStaff();
  if ("denied" in gate) return;
  const id = formString(formData, "id");
  const nextActive = formString(formData, "next") === "true";
  if (!id) return;
  await gate.supabase.from("products").update({ is_active: nextActive }).eq("id", id);
  revalidatePath("/admin/products");
  revalidatePath("/products");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const gate = await requireStaff();
  if ("denied" in gate) return;
  const id = formString(formData, "id");
  const confirmWord = formString(formData, "confirm");
  if (!id || confirmWord !== "DELETE") return; // double-gated: UI confirm + word
  const { error } = await gate.supabase.from("products").delete().eq("id", id);
  if (!error) {
    log.info("admin.product_deleted", { productId: id });
    revalidatePath("/admin/products");
    revalidatePath("/products");
  }
}

export async function requireStaffRedirect(): Promise<boolean> {
  const gate = await requireStaff();
  if ("denied" in gate) {
    if (!supabaseConfigured()) return false; // page renders the demo notice itself
    redirect("/login?next=/admin/products");
  }
  return true;
}
