// src/types/database.ts
// Hand-maintained mirror of the public schema row shapes (0001_init.sql).
// In production you would generate this with
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
// and pin the client to it. Kept structurally aligned with the migration;
// bigint columns surface as string from PostgREST — helpers narrow them.

import type { Currency, ProductBrand, ServiceKind } from "@/types/catalog";
import type {
  OrderStatus,
  PaymentStatus,
} from "@/types/checkout";
import type { ServiceRequestStatus } from "@/types/services";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

export type UsersRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: "customer" | "staff" | "admin";
  created_at: string;
  updated_at: string;
};

export type OrdersRow = {
  id: string;
  order_number: string;
  payment_reference: string;
  user_id: string;
  quote_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  display_currency: Currency;
  charge_currency: Currency;
  subtotal_display_minor: number | string;
  shipping_display_minor: number | string;
  total_display_minor: number | string;
  total_charge_minor: number | string;
  shipping_zone: string;
  shipping_address: Json;
  customer_email_snapshot: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItemsRow = {
  id: string;
  order_id: string;
  item_kind: "product" | "service_addon";
  product_id: string | null;
  service_id: string | null;
  parent_order_item_id: string | null;
  quantity: number;
  name_snapshot: string;
  sku_snapshot: string | null;
  unit_price_base_minor: number | string;
  unit_price_display_minor: number | string;
  unit_price_charge_minor: number | string;
  line_total_base_minor: number | string;
  line_total_display_minor: number | string;
  line_total_charge_minor: number | string;
};

export type OrderEventsRow = {
  id: string;
  order_id: string;
  event_type: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  created_at: string;
};

export type ServiceRequestsRow = {
  id: string;
  request_number: string;
  user_id: string;
  service_id: string;
  status: ServiceRequestStatus;
  requested_start_at: string | null;
  requested_end_at: string | null;
  site_address: Json;
  notes: string | null;
  estimated_price_minor: number | string | null;
  currency: Currency;
  created_at: string;
  updated_at: string;
};

export type MinorAmount = number | string;

/** PostgREST can deliver bigint columns as strings; normalize once, centrally. */
export function toMinor(v: MinorAmount | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`Corrupt minor amount from database: ${String(v)}`);
  }
  return n;
}

export type CategoriesRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
};

export type CartItemsRow = {
  id: string;
  user_id: string | null;
  session_id: string | null;
  product_id: string;
  quantity: number;
  selected_addons: string[];
  created_at: string;
  updated_at: string;
};
