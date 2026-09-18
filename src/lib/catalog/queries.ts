// src/lib/catalog/queries.ts
// Server Components data access (§7.1: catalog is owned by server + query
// cache). All reads flow through the ANON/authenticated SSR client, so RLS
// is the access boundary here too — a leaked id can never surface inactive
// or foreign rows.
//
// Demo fallback (offline UI testing): every read is wrapped in
// withDemoFallback — when Supabase is unconfigured or failing (and the
// environment permits demo mode, see src/lib/demo/mode.ts), the identical
// view-models are served from the static seed mirror (src/lib/demo/data.ts)
// using the SAME filter semantics, so the UI behaves the same offline.

import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withDemoFallback } from "@/lib/demo/mode";
import {
  demoBookingService,
  demoBookingServices,
  demoCategories,
  demoListProductCards,
  demoProductDetail,
  demoUsageTags,
} from "@/lib/demo/catalog";
import type { ProductCard, ProductDetail, ServiceVM } from "@/types/catalog";

export type ProductFilters = {
  category?: string;
  brand?: string[];
  usage?: string[];
  availableOnly?: boolean;
  minNgnMinor?: number;
  maxNgnMinor?: number;
  page?: number;
};

const PAGE_SIZE = 12;

/** Add-on services are global, so "attach to card" = list once per page. */
export const listProductCards = cache(
  async (filters: ProductFilters): Promise<{
    cards: ProductCard[];
    page: number;
    pageSize: number;
    totalCount: number | null;
  }> =>
    withDemoFallback(
      async () => {
        const supabase = await createServerSupabaseClient();
        const page = Math.max(1, filters.page ?? 1);

        let query = supabase
          .from("products")
          .select(
            "id, sku, slug, name, brand, category, usage_tags, unit_price_minor, inventory_qty, image_urls",
            { count: "exact" }
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        if (filters.category) query = query.eq("category", filters.category);
        if (filters.brand?.length) query = query.in("brand", filters.brand);
        if (filters.usage?.length)
          query = query.contains("usage_tags", filters.usage);
        if (filters.availableOnly) query = query.gt("inventory_qty", 0);
        if (typeof filters.minNgnMinor === "number")
          query = query.gte("unit_price_minor", filters.minNgnMinor);
        if (typeof filters.maxNgnMinor === "number")
          query = query.lte("unit_price_minor", filters.maxNgnMinor);

        const { data, error, count } = await query;
        if (error) throw new Error("catalog_unavailable");

        const { data: addonRows } = await supabase
          .from("services")
          .select("id, name, base_price_minor")
          .eq("kind", "add_on")
          .eq("is_active", true);

        const addons = (addonRows ?? []).map((row) => ({
          id: String(row.id),
          name: String(row.name),
          basePriceMinor: Number(row.base_price_minor),
        }));

        return {
          cards: (data ?? []).map((row) => ({
            id: String(row.id),
            sku: String(row.sku),
            slug: String(row.slug),
            name: String(row.name),
            brand: row.brand as ProductCard["brand"],
            category: String(row.category),
            usageTags: (row.usage_tags as string[] | null) ?? [],
            unitPriceMinor: Number(row.unit_price_minor),
            inventoryQty: Number(row.inventory_qty),
            imageUrls: (row.image_urls as string[] | null) ?? [],
            addonServices: addons,
          })),
          page,
          pageSize: PAGE_SIZE,
          totalCount: count,
        };
      },
      () => demoListProductCards(filters)
    )
);

export const listDistinctCategories = cache(async (): Promise<string[]> =>
  withDemoFallback(
    async () => {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase
        .from("products")
        .select("category")
        .eq("is_active", true);
      return [...new Set((data ?? []).map((r) => String(r.category)))].sort();
    },
    () => demoCategories()
  )
);

export const listDistinctUsageTags = cache(async (): Promise<string[]> =>
  withDemoFallback(
    async () => {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase
        .from("products")
        .select("usage_tags")
        .eq("is_active", true);
      return [
        ...new Set((data ?? []).flatMap((r) => (r.usage_tags as string[]) ?? [])),
      ].sort();
    },
    () => demoUsageTags()
  )
);

export const getProductDetail = cache(
  async (slug: string): Promise<ProductDetail | null> =>
    withDemoFallback(
      async () => {
        const supabase = await createServerSupabaseClient();

        const { data: row, error } = await supabase
          .from("products")
          .select("*")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (error) throw new Error("catalog_unavailable");
        if (!row) return null;

        const { data: addonRows } = await supabase
          .from("services")
          .select("id, name, base_price_minor, duration_minutes")
          .eq("kind", "add_on")
          .eq("is_active", true);

        return {
          id: String(row.id),
          sku: String(row.sku),
          slug: String(row.slug),
          name: String(row.name),
          description: (row.description as string | null) ?? null,
          brand: String(row.brand),
          category: String(row.category),
          usageTags: (row.usage_tags as string[] | null) ?? [],
          imageUrls: (row.image_urls as string[] | null) ?? [],
          unitPriceMinor: Number(row.unit_price_minor),
          inventoryQty: Number(row.inventory_qty),
          shippingClass: String(row.shipping_class),
          availableAddons: (addonRows ?? []).map((a) => ({
            id: String(a.id),
            name: String(a.name),
            basePriceMinor: Number(a.base_price_minor),
            durationMinutes:
              a.duration_minutes === null || a.duration_minutes === undefined
                ? null
                : Number(a.duration_minutes),
          })),
        };
      },
      () => demoProductDetail(slug)
    )
);

export const listBookingServices = cache(async (): Promise<ServiceVM[]> =>
  withDemoFallback(
    async () => {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("kind", "booking")
        .eq("is_active", true)
        .order("name");

      if (error) throw new Error("catalog_unavailable");
      return (data ?? []).map(toServiceVM);
    },
    () => demoBookingServices()
  )
);

export const getBookingService = cache(
  async (slug: string): Promise<ServiceVM | null> =>
    withDemoFallback(
      async () => {
        const supabase = await createServerSupabaseClient();
        const { data, error } = await supabase
          .from("services")
          .select("*")
          .eq("slug", slug)
          .eq("kind", "booking")
          .eq("is_active", true)
          .maybeSingle();

        if (error) throw new Error("catalog_unavailable");
        return data ? toServiceVM(data) : null;
      },
      () => demoBookingService(slug)
    )
);

function toServiceVM(row: Record<string, unknown>): ServiceVM {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    kind: row.kind as ServiceVM["kind"],
    basePriceMinor: Number(row.base_price_minor),
    durationMinutes:
      row.duration_minutes === null ? null : Number(row.duration_minutes),
    requiresSchedule: Boolean(row.requires_schedule),
  };
}
