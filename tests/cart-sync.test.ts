// tests/cart-sync.test.ts — the pure mapping layer of the Supabase cart
// mirror (src/lib/cart/sync.ts). The IO half swallows errors by design, so
// everything with correctness risk — per-product aggregation, add-on unioning
// under parents, the 1..999 clamp, hydration-merge precedence, and
// vanished-product pruning — lives in these pure functions and is pinned here.

import { describe, expect, it } from "vitest";
import {
  linesToSyncRows,
  mergeRemoteLines,
  ownerOf,
  rowsToCartLines,
  type RemoteRow,
} from "@/lib/cart/sync";
import type { CartLine } from "@/stores/cart-store";

function productLine(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: over.lineId ?? "L1",
    kind: "product",
    productId: "P1",
    name: "Hikvision Dome",
    sku: "HK-T124",
    quantity: 1,
    baseUnitMinor: 18_500_000,
    baseCurrency: "NGN",
    isShippable: true,
    shippingClass: "standard",
    ...over,
  };
}

function addonLine(over: Partial<CartLine> = {}): CartLine {
  return {
    lineId: over.lineId ?? "A1",
    kind: "service_addon",
    serviceId: "S1",
    parentLineId: "L1",
    name: "Commissioning",
    quantity: 1,
    baseUnitMinor: 4_500_000,
    baseCurrency: "NGN",
    isShippable: false,
    ...over,
  };
}

describe("linesToSyncRows", () => {
  it("groups add-ons under their parent product and sums quantities", () => {
    const rows = linesToSyncRows([
      productLine(),
      addonLine(),
      addonLine({ lineId: "A2", serviceId: "S2" }),
      productLine({ lineId: "L2", productId: "P2", quantity: 3 }),
    ]);
    expect(rows).toEqual([
      { product_id: "P1", quantity: 1, selected_addons: ["S1", "S2"] },
      { product_id: "P2", quantity: 3, selected_addons: [] },
    ]);
  });

  it("merges duplicate product ids into one row, clamped to the DB bound", () => {
    const rows = linesToSyncRows([
      productLine({ quantity: 900 }),
      productLine({ lineId: "Lx", quantity: 200 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(999); // least(1100, 999) — mirrors the 0008 CHECK
  });

  it("drops orphan add-ons (no parent) instead of corrupting a row", () => {
    const rows = linesToSyncRows([addonLine({ parentLineId: "ghost" })]);
    expect(rows).toEqual([]);
  });
});

describe("rowsToCartLines", () => {
  const row: RemoteRow = {
    id: "R1",
    user_id: "U1",
    session_id: null,
    product_id: "P1",
    quantity: 2,
    selected_addons: ["S1"],
  };

  it("rebuilds parent+child lines keyed off server row ids", () => {
    const lines = rowsToCartLines(
      [row],
      [
        {
          id: "P1",
          name: "Hikvision Dome",
          sku: "HK-T124",
          unit_price_minor: 18_500_000,
          shipping_class: "standard",
        },
      ],
      [{ id: "S1", name: "Commissioning", base_price_minor: 4_500_000 }]
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      lineId: "R1",
      quantity: 2,
      baseUnitMinor: 18_500_000,
    });
    expect(lines[1]).toMatchObject({
      kind: "service_addon",
      parentLineId: "R1",
      lineId: "R1:S1",
    });
  });

  it("prunes rows whose product vanished from the catalog", () => {
    expect(rowsToCartLines([row], [], [])).toEqual([]);
  });
});

describe("mergeRemoteLines", () => {
  it("server wins per product; local-only lines survive for the next push", () => {
    const remote = rowsToCartLines(
      [
        {
          id: "R1",
          user_id: "U1",
          session_id: null,
          product_id: "P1",
          quantity: 7,
          selected_addons: [],
        },
      ],
      [
        { id: "P1", name: "n", sku: "s", unit_price_minor: 1, shipping_class: "standard" },
      ],
      []
    );
    const merged = mergeRemoteLines(
      [productLine({ quantity: 2 }), productLine({ lineId: "L9", productId: "P9" })],
      remote
    );
    const p1 = merged.filter((l) => l.productId === "P1");
    expect(p1).toHaveLength(1);
    expect(p1[0]?.quantity).toBe(7); // remote overrode the local 2
    expect(merged.some((l) => l.productId === "P9")).toBe(true);
  });
});

describe("ownerOf", () => {
  it("authenticated owners ignore the guest bucket", () => {
    expect(ownerOf({ id: "U1" }, "g-abc123")).toEqual({ kind: "user", userId: "U1" });
  });

  it("guests need a bucket id; otherwise no sync at all", () => {
    expect(ownerOf(null, null)).toBeNull();
    expect(ownerOf(null, "g-abc123")).toEqual({ kind: "guest", sessionId: "g-abc123" });
  });
});
