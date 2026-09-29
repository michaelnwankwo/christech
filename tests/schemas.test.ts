// tests/schemas.test.ts — the zod gates every API route runs first.
import { describe, expect, it } from "vitest";
import {
  checkoutInitializeSchema,
  parseBody,
  quoteRequestSchema,
  serviceQuoteRequestSchema,
  serviceRequestSchema,
} from "@/lib/validation/schemas";

const UUID = "8cc8f123-6e8b-4cc4-9fb7-d3c606f1a7d9";
const address = {
  country: "NG",
  state: "Lagos",
  city: "Ikeja",
  addressLine1: "1 Example Road",
};

describe("quoteRequestSchema", () => {
  it("accepts the §17.1 sample payload", () => {
    const result = parseBody(quoteRequestSchema, {
      displayCurrency: "USD",
      address,
      lines: [
        { clientLineId: "line-1", kind: "product", productId: UUID, quantity: 2 },
        {
          clientLineId: "line-2",
          kind: "service_addon",
          serviceId: UUID,
          parentClientLineId: "line-1",
          quantity: 1,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an add-on with no parent (test 19.1)", () => {
    const result = parseBody(quoteRequestSchema, {
      displayCurrency: "NGN",
      address,
      lines: [
        {
          clientLineId: "l1",
          kind: "service_addon",
          serviceId: UUID,
          quantity: 1,
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects zero or negative quantities", () => {
    for (const quantity of [0, -4, 1.5]) {
      expect(
        parseBody(quoteRequestSchema, {
          displayCurrency: "NGN",
          address,
          lines: [{ clientLineId: "l1", kind: "product", productId: UUID, quantity }],
        }).ok
      ).toBe(false);
    }
  });

  it("rejects currencies outside the enum", () => {
    expect(
      parseBody(quoteRequestSchema, {
        displayCurrency: "GHS",
        address,
        lines: [{ clientLineId: "l1", kind: "product", productId: UUID, quantity: 1 }],
      }).ok
    ).toBe(false);
  });
});

describe("checkoutInitializeSchema", () => {
  it("requires an idempotency key (§18.4)", () => {
    const without = checkoutInitializeSchema.safeParse({
      quoteId: UUID,
      lines: [],
      shippingAddress: address,
    });
    expect(without.success).toBe(false);

    const withKey = checkoutInitializeSchema.safeParse({
      quoteId: UUID,
      idempotencyKey: "a1b2c3d4-e5f6",
      lines: [{ clientLineId: "l1", kind: "product", productId: UUID, quantity: 1 }],
      shippingAddress: address,
    });
    expect(withKey.success).toBe(true);
  });
});

describe("serviceRequestSchema", () => {
  it("requires end-after-start ordering", () => {
    const bad = serviceRequestSchema.safeParse({
      serviceId: UUID,
      requestedStartAt: "2030-10-02T12:00:00.000Z",
      requestedEndAt: "2030-10-02T09:00:00.000Z",
      siteAddress: address,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects past windows", () => {
    const past = serviceRequestSchema.safeParse({
      serviceId: UUID,
      requestedStartAt: "2020-01-01T09:00:00.000Z",
      siteAddress: address,
    });
    expect(past.success).toBe(false);
  });

  it("accepts the §17.4 sample payload", () => {
    const ok = serviceRequestSchema.safeParse({
      serviceId: UUID,
      requestedStartAt: "2030-10-02T09:00:00.000Z",
      requestedEndAt: "2030-10-02T12:00:00.000Z",
      siteAddress: { ...address, city: "Lekki" },
      notes: "Please inspect the existing network cabinet.",
    });
    expect(ok.success).toBe(true);
  });
});

describe("serviceQuoteRequestSchema", () => {
  const futureDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const guestPayload = () => ({
    serviceId: UUID,
    customerName: "Ada Obi",
    customerPhone: "+234 801 234 5678",
    customerEmail: "ada@example.com",
    siteAddress: "12 Adeola Odeku St, Victoria Island, Lagos",
    preferredDate: futureDate(),
    timeWindow: "Morning (08:00 – 11:00)",
    siteNotes: "8 cameras, 2-storey building.",
  });

  it("accepts a guest quote payload with no auth fields", () => {
    const ok = serviceQuoteRequestSchema.safeParse(guestPayload());
    expect(ok.success).toBe(true);
  });

  it("rejects a past preferred inspection date", () => {
    const bad = serviceQuoteRequestSchema.safeParse({
      ...guestPayload(),
      preferredDate: "2020-01-01",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    const bad = serviceQuoteRequestSchema.safeParse({
      ...guestPayload(),
      preferredDate: "2026-02-31",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown time window", () => {
    const bad = serviceQuoteRequestSchema.safeParse({
      ...guestPayload(),
      timeWindow: "Whenever o'clock",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a malformed phone number", () => {
    const bad = serviceQuoteRequestSchema.safeParse({
      ...guestPayload(),
      customerPhone: "0801-CALL-NOW",
    });
    expect(bad.success).toBe(false);
  });

  it("carries no price field anywhere a client could set one", () => {
    const greedy = serviceQuoteRequestSchema.safeParse({
      ...guestPayload(),
      quotedPriceMinor: 25_000_000,
    });
    // Passthrough of unknown keys is stripped by zod's default shaping; the
    // parsed output must never echo a client-proposed amount back.
    expect(greedy.success).toBe(true);
    if (greedy.success) {
      expect("quotedPriceMinor" in greedy.data).toBe(false);
    }
  });
});
