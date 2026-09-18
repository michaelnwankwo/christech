// tests/cart-store.test.ts — §19.4 UI-logic gates that live in the store:
// add-on parent enforcement, removal cascade, quote invalidation, quantity
// guards. Zustand runs headless (no localStorage in node → persist no-ops).

import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore, cartSubtotalDisplayMinor, type CartLine } from "@/stores/cart-store";

function product(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: `p-${Math.random().toString(36).slice(2)}`,
    kind: "product",
    productId: "11111111-1111-1111-1111-111111111111",
    name: "Cisco Switch",
    sku: "CC-1",
    quantity: 1,
    baseUnitMinor: 1_000_000,
    baseCurrency: "NGN",
    isShippable: true,
    shippingClass: "standard",
    ...overrides,
  };
}

function addon(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: `a-${Math.random().toString(36).slice(2)}`,
    kind: "service_addon",
    serviceId: "22222222-2222-2222-2222-222222222222",
    name: "Commissioning",
    quantity: 1,
    baseUnitMinor: 450_000,
    baseCurrency: "NGN",
    isShippable: false,
    ...overrides,
  };
}

beforeEach(() => {
  useCartStore.setState({
    mode: "storefront",
    displayCurrency: "NGN",
    lines: [],
    fxRates: { NGN: 1 },
    quote: undefined,
    quoteError: undefined,
  });
});

describe("cart store", () => {
  it("merges quantities for the same product id instead of duplicating", () => {
    const store = useCartStore.getState();
    store.addProduct(product());
    store.addProduct(product({ quantity: 2 }));

    const lines = useCartStore.getState().lines.filter((l) => l.kind === "product");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
  });

  it("refuses add-ons with a missing parent (returns false, no throw)", () => {
    const ok = useCartStore
      .getState()
      .addServiceAddon(addon(), "no-such-line");
    expect(ok).toBe(false);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("attaches add-ons under their parent and cascades removal (§2.3)", () => {
    const parent = product();
    useCartStore.getState().addProduct(parent);
    const ok = useCartStore
      .getState()
      .addServiceAddon(addon(), parent.lineId);
    expect(ok).toBe(true);
    expect(useCartStore.getState().lines).toHaveLength(2);

    useCartStore.getState().removeLine(parent.lineId);
    expect(useCartStore.getState().lines).toHaveLength(0); // child cascaded
  });

  it("currency change clears a stale shipping quote (§21.1 #7)", () => {
    useCartStore.setState({
      quote: {
        quoteId: "q1",
        displayCurrency: "NGN",
        chargeCurrency: "NGN",
        subtotalDisplayMinor: 1,
        shippingDisplayMinor: 1,
        totalDisplayMinor: 2,
        totalChargeMinor: 2,
        zoneCode: "ng-other",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        conversionDisclosure: "",
      },
    });

    useCartStore.getState().setDisplayCurrency("USD");
    expect(useCartStore.getState().quote).toBeUndefined();
  });

  it("line edits also invalidate the quote", () => {
    const parent = product();
    useCartStore.getState().addProduct(parent);
    useCartStore.setState({ quote: undefined });
    useCartStore.getState().addProduct(parent); // merge path
    useCartStore.setState({
      quote: {
        quoteId: "q",
        displayCurrency: "NGN",
        chargeCurrency: "NGN",
        subtotalDisplayMinor: 1,
        shippingDisplayMinor: 0,
        totalDisplayMinor: 1,
        totalChargeMinor: 1,
        zoneCode: "ng",
        expiresAt: "",
        conversionDisclosure: "",
      },
    });
    useCartStore.getState().updateQuantity(parent.lineId, 9);
    expect(useCartStore.getState().quote).toBeUndefined();
  });

  it("quantities are clamped to sane bounds", () => {
    const line = product();
    useCartStore.getState().addProduct(product({ ...line, quantity: 5000 }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(999);

    useCartStore.getState().updateQuantity(line.lineId, 0); // ignored (<1)
    useCartStore.getState().updateQuantity(line.lineId, -3); // ignored
  });

  it("checkout payload carries ids and quantities only — no amounts (§2.2)", () => {
    const parent = product();
    useCartStore.getState().addProduct(parent);
    const payload = useCartStore.getState().toCheckoutPayload();
    expect(payload[0]).not.toHaveProperty("baseUnitMinor");
    expect(payload[0]).not.toHaveProperty("price");
    expect(payload[0]).toMatchObject({
      clientLineId: parent.lineId,
      kind: "product",
      productId: parent.productId,
      quantity: 1,
    });
  });
});

describe("cartSubtotalDisplayMinor", () => {
  it("is identity for NGN", () => {
    const lines = [product({ quantity: 2 })];
    expect(
      cartSubtotalDisplayMinor({ lines, displayCurrency: "NGN", fxRates: { NGN: 1 } })
    ).toBe(2_000_000);
  });

  it("returns null (not a wrong number) when a rate is missing", () => {
    const lines = [product()];
    expect(
      cartSubtotalDisplayMinor({ lines, displayCurrency: "GBP", fxRates: {} })
    ).toBeNull();
  });
});
