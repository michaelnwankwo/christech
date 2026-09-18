// tests/signature.test.ts — §19.3 webhook security half (route-agnostic core).
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaystackSignature } from "@/lib/payments/signature";

const SECRET = "sk_test_0123456789";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

describe("verifyPaystackSignature", () => {
  const body = JSON.stringify({ event: "charge.success", data: { id: 7 } });

  it("accepts a correct HMAC over the raw bytes", () => {
    expect(verifyPaystackSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it("rejects any byte change (body re-serialization attack)", () => {
    const tampered = body.replace("7", "8");
    expect(verifyPaystackSignature(Buffer.from(tampered), sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    expect(
      verifyPaystackSignature(Buffer.from(body), sign(body, "sk_test_evil"), SECRET)
    ).toBe(false);
  });

  it("rejects missing / malformed / empty-secret cases", () => {
    expect(verifyPaystackSignature(Buffer.from(body), null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(Buffer.from(body), "not-hex", SECRET)).toBe(false);
    expect(verifyPaystackSignature(Buffer.from(body), "deadbeef", SECRET)).toBe(false);
    expect(verifyPaystackSignature(Buffer.from(body), sign(body), "")).toBe(false);
    expect(verifyPaystackSignature(Buffer.from(body), sign(body), undefined)).toBe(false);
  });

  it("tolerates whitespace + casing of the header value", () => {
    expect(
      verifyPaystackSignature(Buffer.from(body), `  ${sign(body).toUpperCase()}  `, SECRET)
    ).toBe(true);
  });
});
