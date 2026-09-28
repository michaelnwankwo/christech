import { describe, expect, it } from "vitest";
import {
  normalizeShippingAddressInput,
  zoneLabelForPreview,
} from "@/lib/shipping/zones";
import { quoteRequestSchema } from "@/lib/validation/schemas";

const productLine = {
  clientLineId: "line-1",
  kind: "product" as const,
  productId: "8cc8f123-6e8b-4cc4-9fb7-d3c606f1a7d9",
  quantity: 1,
};

describe("shipping address normalization", () => {
  it("folds case, spacing, State/LGA suffixes and postal code", () => {
    const address = normalizeShippingAddressInput({
      country: " ng ",
      state: "  LAGOS MAINLAND state ",
      city: " Ikeja LGA ",
      addressLine1: "  1   Example Road ",
      postalCode: " la-10001 ",
    });

    expect(address).toEqual({
      country: "NG",
      state: "Lagos",
      city: "Ikeja",
      addressLine1: "1 Example Road",
      addressLine2: undefined,
      postalCode: "LA-10001",
    });
    expect(zoneLabelForPreview(address)).toBe("Lagos Mainland");
  });

  it("preserves a case-insensitive Lagos Island tier through city matching", () => {
    const address = normalizeShippingAddressInput({
      country: "ng",
      state: "lagos island",
      city: "Eti Osa",
      addressLine1: "12 Admiralty Way",
    });
    expect(address.state).toBe("Lagos");
    expect(address.city).toContain("Victoria Island");
    expect(zoneLabelForPreview(address)).toBe("Lagos Island");
  });

  it("normalizes validated quote payloads before pricing", () => {
    const parsed = quoteRequestSchema.parse({
      displayCurrency: "NGN",
      address: {
        country: "ng",
        state: " lagos state ",
        city: " ikeja lga ",
        addressLine1: " 2  Allen Avenue ",
      },
      lines: [productLine],
    });

    expect(parsed.address).toMatchObject({
      country: "NG",
      state: "Lagos",
      city: "ikeja",
      addressLine1: "2 Allen Avenue",
    });
  });
});
