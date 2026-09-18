// src/lib/payments/signature.ts
// Paystack webhook signature verification (blueprint §15.1): HMAC-SHA512 of
// the RAW BODY with the secret key, compared in constant time.
// Extracted from the route so it is unit-testable and reviewable in one
// screen: the ONLY acceptable verification path.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @param rawBody          exact bytes received (never re-serialized JSON)
 * @param signatureHeader  value of `x-paystack-signature` (lowercase hex)
 * @param secret           PAYSTACK_SECRET_KEY
 */
export function verifyPaystackSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false; // fail closed on misconfiguration
  if (!signatureHeader) return false;

  // Only 128-char lowercase hex can be a real sha512 HMAC — reject
  // malformed input BEFORE touching timingSafeEqual (it throws on short
  // buffers) and to normalize away whitespace.
  const candidate = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(candidate)) return false;

  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const received = Buffer.from(candidate, "hex");

  // Length guard first (timingSafeEqual throws on length mismatch); both
  // paths are constant-time-equivalent for a fixed-length HMAC.
  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}
