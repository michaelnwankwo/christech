// src/lib/demo/quote.ts
// Demo-mode quote math — PURE (no server-only imports, no env reads), so
// vitest can exercise the exact code the API route runs.
//
// Discipline mirrors §12.1: the caller sends ids+quantities only; every
// amount is re-derived from the demo catalog here. Prices, zone, and FX come
// from server-owned inputs. The client still never decides the charged
// amount, even when the "database" is a mock.

import type { Currency } from "@/types/catalog";
import type { CheckoutLineInput, ShippingAddress } from "@/types/checkout";
import {
  DEMO_PRODUCTS,
  DEMO_SERVICES,
  DEMO_SHIPPING_MINOR,
  DEMO_ZONE_BY_LABEL,
} from "./data";
import { zoneLabelForPreview } from "@/lib/shipping/zones";

export type DemoFx = {
  rates: Partial<Record<Currency, number>>;
};

export type DemoQuoteInput = {
  lines: CheckoutLineInput[];
  address: ShippingAddress;
  displayCurrency: Currency;
  chargeCurrency: Currency;
  fx: DemoFx;
  ttlSeconds: number;
  nowMs?: number;
  /** Builds the disclosure line (injected to keep this module env-free). */
  disclosureFor: (display: Currency, charge: Currency) => string;
};

export type DemoQuote = {
  quoteId: string;
  displayCurrency: Currency;
  chargeCurrency: Currency;
  subtotalDisplayMinor: number;
  shippingDisplayMinor: number;
  totalDisplayMinor: number;
  totalChargeMinor: number;
  subtotalBaseMinor: number;
  shippingBaseMinor: number;
  totalBaseMinor: number;
  zoneCode: string;
  expiresAt: string; // ISO
  conversionDisclosure: string;
  demo: true;
};

export function demoZoneCode(address: ShippingAddress): string {
  const label = zoneLabelForPreview(address);
  return DEMO_ZONE_BY_LABEL[label] ?? "ng-other";
}

/** Half-up minor rounding — same contract as convertBaseToDisplay. */
function toDisplay(baseMinor: number, currency: Currency, rates: DemoFx["rates"]): number | null {
  if (currency === "NGN") return baseMinor;
  const rate = rates[currency];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(baseMinor * rate);
}

/**
 * @returns the computed quote, or { error } using the same wording family
 * the DB RPC uses so the UI error path stays identical.
 */
export function computeDemoQuote(
  input: DemoQuoteInput
): { quote: DemoQuote } | { error: string; status: number } {
  const { lines, displayCurrency, chargeCurrency, fx } = input;

  if (!lines.length) return { error: "Cart is empty", status: 422 };

  const seen = new Set<string>();
  let subtotalBase = 0;
  const shippingClasses = new Set<string>();

  const productLineById = new Map<string, CheckoutLineInput>(
    lines
      .filter((l) => l.kind === "product")
      .map((l) => [l.clientLineId, l])
  );

  for (const line of lines) {
    if (line.kind !== "product" && line.kind !== "service_addon") {
      return { error: "Line kind is not accepted in a cart", status: 422 };
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) {
      return { error: "Quantity out of bounds (1–999)", status: 422 };
    }

    if (line.kind === "product") {
      if (!line.productId) return { error: "Product line requires productId", status: 422 };
      if (seen.has(line.productId)) return { error: "Duplicate product line", status: 422 };
      seen.add(line.productId);

      const product = DEMO_PRODUCTS.find((p) => p.id === line.productId);
      if (!product) return { error: "Unknown product id", status: 404 };

      subtotalBase += product.unitPriceMinor * line.quantity;
      if (product.inventoryQty <= 0) {
        return { error: `${product.name} is out of stock`, status: 409 };
      }
      shippingClasses.add(product.shippingClass);
    } else {
      if (!line.serviceId) return { error: "Addon line requires serviceId", status: 422 };
      if (!line.parentClientLineId || !productLineById.has(line.parentClientLineId)) {
        return { error: "Addon must reference a product line in this cart", status: 422 };
      }
      const service = DEMO_SERVICES.find((s) => s.id === line.serviceId);
      if (!service) return { error: "Unknown service id", status: 404 };
      if (service.kind !== "add_on") {
        return { error: "Only add-on services can join a cart", status: 422 };
      }
      subtotalBase += service.basePriceMinor * line.quantity; // not shipped
    }
  }

  // Shipping: max rate across the distinct classes present (bulky wins),
  // matching the seeded rate-card model. Zero shipped lines → free.
  const zone = demoZoneCode(input.address);
  let shippingBase = 0;
  for (const cls of shippingClasses) {
    const rate = DEMO_SHIPPING_MINOR[`${zone}:${cls}`];
    if (typeof rate === "number" && rate > shippingBase) shippingBase = rate;
  }

  const totalBase = subtotalBase + shippingBase;

  const subtotalDisplay = toDisplay(subtotalBase, displayCurrency, fx.rates);
  const shippingDisplay = toDisplay(shippingBase, displayCurrency, fx.rates);
  const totalDisplay = toDisplay(totalBase, displayCurrency, fx.rates);
  const totalCharge = toDisplay(totalBase, chargeCurrency, fx.rates);
  if (
    subtotalDisplay === null ||
    shippingDisplay === null ||
    totalDisplay === null ||
    totalCharge === null
  ) {
    return { error: "Exchange rate unavailable for the selected currency", status: 503 };
  }

  const nowMs = input.nowMs ?? Date.now();
  // uuid-shaped so the shared zod schemas treat demo ids like real ones.
  const hex = (nowMs % 0xffffffffffff).toString(16).padStart(12, "0");
  const quoteId = `de400000-0de4-4000-8000-${hex}`;

  return {
    quote: {
      quoteId,
      displayCurrency,
      chargeCurrency,
      subtotalDisplayMinor: subtotalDisplay,
      shippingDisplayMinor: shippingDisplay,
      totalDisplayMinor: totalDisplay,
      totalChargeMinor: totalCharge,
      subtotalBaseMinor: subtotalBase,
      shippingBaseMinor: shippingBase,
      totalBaseMinor: totalBase,
      zoneCode: zone,
      expiresAt: new Date(nowMs + input.ttlSeconds * 1000).toISOString(),
      conversionDisclosure: input.disclosureFor(displayCurrency, chargeCurrency),
      demo: true,
    },
  };
}

/** Demo booking-ticket generator — the shape mirrors the DB insert result. */
export function demoServiceRequestTicket(serviceId: string):
  | { id: string; requestNumber: string; status: "requested"; demo: true }
  | { error: string; status: number } {
  const service = DEMO_SERVICES.find((s) => s.id === serviceId);
  if (!service) return { error: "Service not found or inactive", status: 404 };
  if (service.kind !== "booking") {
    return {
      error: "Only bookable services can be requested here; purchasable add-ons belong in the cart",
      status: 422,
    };
  }
  const stamp = Date.now().toString(36).toUpperCase();
  const hex = (Date.now() % 0xffffffffffff).toString(16).padStart(12, "0");
  return {
    id: `de400000-7100-4000-8000-${hex}`,
    requestNumber: `SRV-DEMO-${stamp.slice(-6)}`,
    status: "requested",
    demo: true,
  };
}
