// tests/demo-layer.test.ts — the offline demo layer must behave like the
// database it mirrors, never like a toy: same filter semantics, server-side
// re-pricing (clients send ids+quantities only), correct zone/shipping math,
// the same rejection classes (unknown ids, orphan/booking add-ons, dupes),
// and a uuid-shaped quoteId so shared validation is exercised too.

import { describe, expect, it } from "vitest";
import {
  demoBookingServices,
  demoListProductCards,
  demoProductDetail,
} from "@/lib/demo/catalog";
import {
  computeDemoQuote,
  demoServiceRequestTicket,
  demoZoneCode,
} from "@/lib/demo/quote";
import { DEMO_PRODUCTS } from "@/lib/demo/data";
import type { CheckoutLineInput, ShippingAddress } from "@/types/checkout";

const MAINLAND: ShippingAddress = {
  country: "NG",
  state: "Lagos",
  city: "Ikeja",
  addressLine1: "12 Adeniyi Jones Ave",
};

const FX = { rates: { NGN: 1, USD: 0.00065 } };
const OPTS = {
  ttlSeconds: 600,
  nowMs: Date.parse("2026-09-18T12:00:00.000Z"),
  disclosureFor: (d: string, c: string) => `${d}→${c}`,
};

function productId(sku: string): string {
  const found = DEMO_PRODUCTS.find((p) => p.sku === sku);
  if (!found) throw new Error(`fixture sku missing: ${sku}`);
  return found.id;
}

function productLine(
  sku: string,
  quantity = 1,
  clientLineId?: string
): CheckoutLineInput {
  return {
    clientLineId: clientLineId ?? `pl-${sku}`,
    kind: "product",
    productId: productId(sku),
    quantity,
  };
}

function quoteWith(lines: CheckoutLineInput[], overrides: object = {}) {
  const result = computeDemoQuote({
    lines,
    address: MAINLAND,
    displayCurrency: "NGN",
    chargeCurrency: "NGN",
    fx: FX,
    ...OPTS,
    ...overrides,
  });
  if ("error" in result) throw Object.assign(new Error(result.error), { result });
  return result.quote;
}

describe("demo catalog mirrors SQL read semantics", () => {
  it("lists the seeded catalog with page size 12 and exact total", () => {
    const r = demoListProductCards({ page: 1 });
    expect(r.totalCount).toBe(10);
    expect(r.pageSize).toBe(12);
    expect(r.cards).toHaveLength(10);
  });

  it("applies category + brand + usage AND semantics", () => {
    expect(
      demoListProductCards({ category: "cameras", brand: ["Hikvision"] }).cards
    ).toHaveLength(1);

    const both = demoListProductCards({ usage: ["cctv", "poe"] });
    expect(both.totalCount).toBe(3); // HK dome, Dahua bullet, Dintek switch
  });

  it("filters by price window and availability", () => {
    const cheap = demoListProductCards({ maxNgnMinor: 1_000_000 });
    expect(cheap.cards.map((c) => c.sku)).toEqual(["HK-DS-1280"]);
  });

  it("detail lookup returns the same view-model shape (and null when unknown)", () => {
    const d = demoProductDetail("dahua-wizmind-5mp-bullet");
    expect(d?.unitPriceMinor).toBe(16_200_000);
    expect(d?.availableAddons.length).toBeGreaterThan(0);
    expect(demoProductDetail("nope")).toBeNull();
  });

  it("only kind='booking' surfaces in the booking domain", () => {
    const names = demoBookingServices().map((s) => s.slug);
    expect(names).toHaveLength(4);
    expect(names).not.toContain("addon-cctv-commissioning");
  });
});

describe("demo quote math (server re-prices; client sends ids only)", () => {
  it("computes subtotal + mainland standard shipping in NGN minor units", () => {
    const q = quoteWith([productLine("HK-IPC-T124", 2)]);
    expect(q.subtotalBaseMinor).toBe(37_000_000);
    expect(q.shippingBaseMinor).toBe(350_000);
    expect(q.totalBaseMinor).toBe(37_350_000);
    expect(q.totalDisplayMinor).toBe(37_350_000);
    expect(q.zoneCode).toBe("lagos-mainland");
    expect(q.demo).toBe(true);
  });

  it("bulky wins the max-rate shipping rule", () => {
    const q = quoteWith([
      productLine("HK-IPC-T124"),
      productLine("HK-NVR-7632"),
    ]);
    expect(q.shippingBaseMinor).toBe(1_200_000); // bulky mainland
  });

  it("add-on services add price but never shipping", () => {
    const q = quoteWith([
      productLine("HK-DS-1280", 2), // 2 × 950_000 = 1_900_000
      {
        clientLineId: "a1",
        kind: "service_addon",
        serviceId: "de400000-0000-4000-8000-000000000021", // commissioning 4_500_000
        parentClientLineId: "pl-HK-DS-1280",
        quantity: 1,
      },
    ]);
    expect(q.subtotalBaseMinor).toBe(6_400_000);
    expect(q.shippingBaseMinor).toBe(350_000); // standard only; addons ship free
  });

  it("rejects add-ons without a parent product line in the same cart", () => {
    const result = computeDemoQuote({
      lines: [
        productLine("HK-DS-1280"),
        {
          clientLineId: "a1",
          kind: "service_addon",
          serviceId: "de400000-0000-4000-8000-000000000021",
          parentClientLineId: "no-such-parent",
          quantity: 1,
        },
      ],
      address: MAINLAND,
      displayCurrency: "NGN",
      chargeCurrency: "NGN",
      fx: FX,
      ...OPTS,
    });
    expect(result).toEqual({
      error: "Addon must reference a product line in this cart",
      status: 422,
    });
  });

  it("rejects booking-kind services in carts with the DB's wording", () => {
    let caught: unknown;
    try {
      quoteWith([
        productLine("HK-IPC-T124"),
        {
          clientLineId: "a1",
          kind: "service_addon",
          serviceId: "de400000-0000-4000-8000-000000000024", // booking
          parentClientLineId: "pl-HK-IPC-T124",
          quantity: 1,
        },
      ]);
    } catch (error) {
      caught = (error as { result?: { error: string; status: number } }).result;
    }
    expect(caught).toEqual({
      error: "Only add-on services can join a cart",
      status: 422,
    });
  });

  it("rejects unknown product ids, duplicates, and out-of-range quantities", () => {
    const cases: CheckoutLineInput[][] = [
      [
        {
          clientLineId: "x",
          kind: "product",
          productId: "00000000-0000-4000-8000-000000000000",
          quantity: 1,
        },
      ],
      [productLine("HK-IPC-T124"), productLine("HK-IPC-T124", 1, "other")],
      [productLine("HK-IPC-T124", 0)],
      [productLine("HK-IPC-T124", 1000)],
    ];
    const results = cases.map((lines) =>
      computeDemoQuote({
        lines,
        address: MAINLAND,
        displayCurrency: "NGN",
        chargeCurrency: "NGN",
        fx: FX,
        ...OPTS,
      })
    );
    expect("error" in results[0]! && results[0]!.status).toBe(404);
    expect("error" in results[1]! && results[1]!.status).toBe(422);
    expect("error" in results[2]! && results[2]!.status).toBe(422);
    expect("error" in results[3]! && results[3]!.status).toBe(422);
  });

  it("never quotes with a missing rate (no silent 1:1)", () => {
    const result = computeDemoQuote({
      lines: [productLine("HK-IPC-T124")],
      address: MAINLAND,
      displayCurrency: "USD",
      chargeCurrency: "USD",
      fx: { rates: { NGN: 1 } },
      ...OPTS,
    });
    expect(result).toEqual({
      error: "Exchange rate unavailable for the selected currency",
      status: 503,
    });
  });

  it("converts display totals with the given rate and rounds half-up to minor", () => {
    const q = quoteWith([productLine("HK-DS-1280")], {
      displayCurrency: "USD",
      chargeCurrency: "USD",
    });
    // bracket 950_000 minor NGN + 350_000 shipping = 1_300_000 × 0.00065
    expect(q.totalDisplayMinor).toBe(Math.round(1_300_000 * 0.00065));
  });

  it("quoteId is uuid-shaped and TTL is honored", () => {
    const q = quoteWith([productLine("HK-IPC-T124")]);
    expect(q.quoteId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
    expect(Date.parse(q.expiresAt)).toBe(OPTS.nowMs + 600_000);
  });

  it("resolves zones through the shared label→code map", () => {
    expect(demoZoneCode({ ...MAINLAND, city: "Lekki Phase 1" })).toBe(
      "lagos-island"
    );
    expect(demoZoneCode({ ...MAINLAND, state: "FCT", city: "Asokoro" })).toBe(
      "abuja"
    );
    expect(demoZoneCode({ ...MAINLAND, state: "Rivers", city: "Port Harcourt" })).toBe(
      "south-south"
    );
    expect(
      demoZoneCode({ ...MAINLAND, country: "GH", state: "Greater Accra", city: "Accra" })
    ).toBe("intl");
  });
});

describe("demo booking tickets", () => {
  it("issues uuid-shaped, clearly-marked demo tickets for booking ids", () => {
    const ok = demoServiceRequestTicket(
      "de400000-0000-4000-8000-000000000024"
    );
    if ("error" in ok) throw new Error("unexpected rejection");
    expect(ok.status).toBe("requested");
    expect(ok.demo).toBe(true);
    expect(ok.requestNumber).toMatch(/^SRV-DEMO-/);
    expect(ok.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("keeps the domain firewall: add-ons and unknown ids are rejected", () => {
    expect(
      demoServiceRequestTicket("de400000-0000-4000-8000-000000000021")
    ).toMatchObject({ status: 422 });
    expect(demoServiceRequestTicket("nope")).toMatchObject({ status: 404 });
  });
});
