// src/lib/cart/sync.ts
// Supabase mirror-sync for the Zustand cart (§7.3 store stays the optimistic
// UI source of truth; the DB is a durable cross-device mirror).
//
// Contract boundaries that must not erode:
//   * cart_items is MIRROR-ONLY. Checkout never reads it for money — the
//     quote RPC re-prices from products/services (0005), so a tampered row
//     changes quantity/selection, never a price.
//   * Signed-in owners sync by auth.uid() under RLS; signed-out devices get a
//     random capability id (localStorage) echoed in the x-cart-session header
//     that the guest RLS policies require (0008).
//   * Offline-demo / unconfigured-Supabase: every entry point no-ops.
//
// Pure mapping functions are exported for vitest; the IO helpers swallow all
// errors (sync is best-effort — the local cart is never blocked by the net).

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCartStore, type CartLine } from "@/stores/cart-store";

export const GUEST_SESSION_KEY = "cv.guest-cart-session";
const SYNC_DEBOUNCE_MS = 800;
const MIN_SESSION_ID_LEN = 8;

export type SyncRow = {
  product_id: string;
  quantity: number;
  selected_addons: string[];
};

export type RemoteRow = SyncRow & {
  id: string;
  user_id: string | null;
  session_id: string | null;
};

export type Owner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; sessionId: string };

export type ProductSnapshot = {
  id: string;
  name: string;
  sku: string;
  unit_price_minor: number;
  shipping_class: string;
};

export type ServiceSnapshot = {
  id: string;
  name: string;
  base_price_minor: number;
};

export function getGuestSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(GUEST_SESSION_KEY);
  if (!id || id.length < MIN_SESSION_ID_LEN) {
    id = newSessionId();
    window.localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function ownerOf(
  user: { id: string } | null,
  guestSessionId: string | null
): Owner | null {
  if (user) return { kind: "user", userId: user.id };
  return guestSessionId ? { kind: "guest", sessionId: guestSessionId } : null;
}

/** Pure: collapse cart lines into per-product rows (quantities summed to the
 *  1..999 clamp, add-on child lines unioned under their parent product). */
export function linesToSyncRows(lines: CartLine[]): SyncRow[] {
  const parents = new Map<string, string>(); // lineId → productId
  for (const line of lines)
    if (line.kind === "product" && line.productId)
      parents.set(line.lineId, line.productId);

  const byProduct = new Map<string, { quantity: number; addons: Set<string> }>();
  for (const line of lines) {
    if (line.kind === "product" && line.productId) {
      const entry =
        byProduct.get(line.productId) ?? { quantity: 0, addons: new Set<string>() };
      entry.quantity += line.quantity;
      byProduct.set(line.productId, entry);
    } else if (line.kind === "service_addon" && line.serviceId) {
      const pid = line.parentLineId ? parents.get(line.parentLineId) : undefined;
      if (pid) byProduct.get(pid)?.addons.add(line.serviceId);
    }
  }

  return [...byProduct.entries()]
    .map(([product_id, { quantity, addons }]) => ({
      product_id,
      quantity: Math.max(1, Math.min(999, quantity)),
      selected_addons: [...addons].sort(),
    }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id));
}

/** Pure: rebuild store lines from server rows + catalog snapshots. Row ids
 *  become lineIds so parent/child links stay stable across devices. Rows for
 *  products that vanished from the catalog are dropped (the next push deletes
 *  them from the mirror). */
export function rowsToCartLines(
  rows: RemoteRow[],
  products: ProductSnapshot[],
  services: ServiceSnapshot[]
): CartLine[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const out: CartLine[] = [];

  for (const row of rows) {
    const product = productById.get(row.product_id);
    if (!product) continue;
    out.push({
      lineId: row.id,
      kind: "product",
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantity: row.quantity,
      baseUnitMinor: product.unit_price_minor,
      baseCurrency: "NGN",
      isShippable: true,
      shippingClass: product.shipping_class,
    });
    for (const addonId of row.selected_addons) {
      const service = serviceById.get(addonId);
      if (!service) continue;
      out.push({
        lineId: `${row.id}:${service.id}`,
        kind: "service_addon",
        serviceId: service.id,
        parentLineId: row.id,
        name: service.name,
        quantity: row.quantity,
        baseUnitMinor: service.base_price_minor,
        baseCurrency: "NGN",
        isShippable: false,
      });
    }
  }
  return out;
}

/** Pure hydration merge: server rows win per product (they may carry another
 *  device's quantity), local-only lines survive to be pushed next. */
export function mergeRemoteLines(
  local: CartLine[],
  remote: CartLine[]
): CartLine[] {
  const remoteProductIds = new Set(
    remote
      .filter((l) => l.kind === "product" && l.productId)
      .map((l) => l.productId as string)
  );
  const kept = local.filter(
    (l) => !(l.kind === "product" && l.productId && remoteProductIds.has(l.productId))
  );
  return [...remote, ...kept];
}

type ScopedQuery = {
  select?: (...args: never[]) => unknown;
  upsert?: (...args: never[]) => unknown;
  delete?: (...args: never[]) => unknown;
  eq: (col: string, val: string) => ScopedQuery;
  set: (headers: Record<string, string>) => ScopedQuery;
};

/** Owner scoping for every cart_items query: auth rows are addressed by the
 *  user_id column (RLS pins it to auth.uid() anyway); guest rows additionally
 *  set the x-cart-session header the 0008 policies read. */
function scopeQuery<T>(query: T, owner: Owner): T {
  const q = query as unknown as ScopedQuery;
  if (owner.kind === "user") return q.eq("user_id", owner.userId) as unknown as T;
  return q
    .set({ "x-cart-session": owner.sessionId })
    .eq("session_id", owner.sessionId) as unknown as T;
}

export async function pullCart(
  sb: SupabaseClient,
  owner: Owner
): Promise<CartLine[]> {
  const { data: rows, error } = (await scopeQuery(
    sb.from("cart_items").select("*"),
    owner
  )) as { data: RemoteRow[] | null; error: unknown };
  if (error || !rows?.length) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const addonIds = [...new Set(rows.flatMap((r) => r.selected_addons))];

  const [productsRes, servicesRes] = await Promise.all([
    sb
      .from("products")
      .select("id, name, sku, unit_price_minor, shipping_class")
      .in("id", productIds),
    addonIds.length
      ? sb.from("services").select("id, name, base_price_minor").in("id", addonIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  return rowsToCartLines(
    rows,
    (productsRes.data ?? []) as unknown as ProductSnapshot[],
    (servicesRes.data ?? []) as unknown as ServiceSnapshot[]
  );
}

export async function pushCart(
  sb: SupabaseClient,
  owner: Owner,
  lines: CartLine[]
): Promise<void> {
  const rows = linesToSyncRows(lines);
  const onConflict =
    owner.kind === "user"
      ? "cart_items_user_product_uidx"
      : "cart_items_session_product_uidx";

  const payloads = rows.map((r) =>
    owner.kind === "user"
      ? { ...r, user_id: owner.userId, session_id: null }
      : { ...r, user_id: null, session_id: owner.sessionId }
  );
  if (payloads.length > 0)
    await scopeQuery(sb.from("cart_items").upsert(payloads, { onConflict }), owner);

  // Drop mirror rows for products no longer in the local cart.
  const keep = rows.map((r) => r.product_id);
  let deletion = scopeQuery(sb.from("cart_items").delete(), owner) as unknown as {
    not: (col: string, op: string, vals: string) => Promise<unknown>;
    then: Promise<unknown>["then"];
  };
  if (keep.length > 0)
    deletion = deletion.not("product_id", "in", `(${keep.join(",")})`) as unknown as typeof deletion;
  await Promise.resolve(deletion);
}

/**
 * Mount-once hook (Providers): initial pull + login fold-in, then debounced
 * pushes of every local mutation. Silent by design while `sb` is null
 * (offline demo / unconfigured env) or the session is still resolving.
 */
export function useCartSync(
  sb: SupabaseClient | null,
  user: { id: string } | null,
  ready: boolean
): void {
  useEffect(() => {
    if (!sb || !ready) return;
    const owner = ownerOf(user, getGuestSessionId());
    if (!owner) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        if (owner.kind === "user" && typeof window !== "undefined") {
          // Fold this device's anonymous bucket in BEFORE pulling (0008).
          const guestId = window.localStorage.getItem(GUEST_SESSION_KEY);
          if (guestId) await sb.rpc("merge_guest_cart", { p_session_id: guestId });
        }
        const remote = await pullCart(sb, owner);
        if (cancelled) return;
        const state = useCartStore.getState();
        if (remote.length > 0)
          state.setCartLines(mergeRemoteLines(state.lines, remote));
        await pushCart(sb, owner, useCartStore.getState().lines);
      } catch {
        /* best-effort mirror — the local cart stays authoritative offline */
      }
    })();

    const unsubscribe = useCartStore.subscribe((state, prev) => {
      if (state.lines === prev.lines) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void pushCart(sb, owner, state.lines).catch(() => {});
      }, SYNC_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [sb, user?.id, ready]);
}
