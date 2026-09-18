// tests/money.test.ts — §19.2: identity conversion, deterministic rounding,
// and the "missing rate never defaults to 1" contract.
import { describe, expect, it } from "vitest";
import { convertBaseToDisplay, formatMinorMoney, parseManualRates } from "@/lib/currency/money";

describe("convertBaseToDisplay", () => {
  it("NGN is the identity conversion", () => {
    expect(convertBaseToDisplay(41_850_000, "NGN", { NGN: 1 })).toBe(41_850_000);
    // Even a poisoned NGN rate must not change base amounts:
    expect(convertBaseToDisplay(123, "NGN", { NGN: 0.5 })).toBe(123);
  });

  it("rounds deterministically to whole minor units (half up)", () => {
    expect(convertBaseToDisplay(41_850_000, "USD", { USD: 0.00065 })).toBe(
      Math.round(41_850_000 * 0.00065)
    ); // 27203 (matches the DB numeric round result verified in 100_assert)
    expect(convertBaseToDisplay(15, "USD", { USD: 0.5 })).toBe(8); // 7.5 → 8
  });

  it("missing / invalid rates return NULL — never a silent 1.0", () => {
    expect(convertBaseToDisplay(5000, "GBP", {})).toBeNull();
    expect(convertBaseToDisplay(5000, "EUR", { EUR: 0 })).toBeNull();
    expect(convertBaseToDisplay(5000, "EUR", { EUR: -1 })).toBeNull();
    expect(convertBaseToDisplay(5000, "USD", { USD: Number.NaN })).toBeNull();
  });
});

describe("formatMinorMoney", () => {
  it("formats NGN minor units with two decimals", () => {
    expect(formatMinorMoney(41_850_000, "NGN")).toBe("₦418,500.00");
  });

  it("formats USD via en-US defaults", () => {
    expect(formatMinorMoney(9025, "USD")).toBe("$90.25");
  });
});

describe("parseManualRates", () => {
  it("parses the fallback env format and always includes NGN:1", () => {
    expect(parseManualRates("USD=0.00065;GBP=0.00051;EUR=0.0006")).toEqual({
      NGN: 1,
      USD: 0.00065,
      GBP: 0.00051,
      EUR: 0.0006,
    });
  });

  it("drops malformed entries instead of inventing rates", () => {
    const parsed = parseManualRates("USD=nonsense;GBP=-2;EUR=0.0006;XXX=9");
    expect(parsed).toEqual({ NGN: 1, EUR: 0.0006 });
  });
});
