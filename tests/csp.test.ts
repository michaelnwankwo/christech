import { describe, expect, it } from "vitest";
import { buildCspHeader } from "@/lib/security/csp";

describe("checkout CSP", () => {
  it("allows the actual Paystack checkout iframe origin", () => {
    const csp = buildCspHeader("test-nonce");

    expect(csp).toContain("script-src 'self' 'nonce-test-nonce' https://js.paystack.co");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("https://api.paystack.co");
    expect(csp).toContain("https://checkout.paystack.com");
    expect(csp).toContain(
      "frame-src https://checkout.paystack.com https://*.paystack.com https://*.paystack.co"
    );
  });
});
