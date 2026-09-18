// tests/currency-adapter.test.ts — §19.2 currency gates (adapter half).
import { describe, expect, it } from "vitest";
import {
  buildConversionDisclosure,
  resolvePaystackChargeCurrencyWith,
} from "@/lib/payments/currency-adapter";
import type { Currency } from "@/types/catalog";

const cfg = (...codes: Currency[]) => new Set(codes);

describe("resolvePaystackChargeCurrency", () => {
  it("passes through configured currencies", () => {
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN", "USD"), "NGN")).toBe("NGN");
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN", "USD"), "USD")).toBe("USD");
  });

  it("maps GBP/EUR to USD when the account supports USD (§2.6)", () => {
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN", "USD"), "GBP")).toBe("USD");
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN", "USD"), "EUR")).toBe("USD");
  });

  it("falls back to NGN when USD is not configured", () => {
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN"), "GBP")).toBe("NGN");
    expect(resolvePaystackChargeCurrencyWith(cfg("NGN"), "EUR")).toBe("NGN");
  });

  it("never emits a currency Paystack does not support", () => {
    const supported: ReadonlySet<string> = new Set(["NGN", "USD"]);
    for (const display of ["NGN", "USD", "GBP", "EUR"] as Currency[]) {
      for (const enabled of [
        cfg("NGN", "USD"),
        cfg("NGN"),
        cfg("USD"),
        cfg("NGN", "USD", "GBP"), // misconfigured env: GBP may display, never charge
      ]) {
        const charge = resolvePaystackChargeCurrencyWith(enabled, display);
        expect(supported.has(charge)).toBe(true);
      }
    }
  });
});

describe("buildConversionDisclosure", () => {
  it("states identity when display == charge", () => {
    expect(buildConversionDisclosure("USD", "USD")).toBe(
      "Your card will be charged in USD."
    );
  });

  it("explains the cross-currency lock when they differ", () => {
    const text = buildConversionDisclosure("GBP", "USD");
    expect(text).toContain("GBP");
    expect(text).toContain("USD");
    expect(text).toContain("locked into this quote");
  });
});
