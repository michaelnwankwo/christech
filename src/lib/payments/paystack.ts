// src/lib/payments/paystack.ts
// Server-side Paystack adapter. Deliberately small:
//   * NO /transaction/initialize call — the browser opens Paystack INLINE
//     with the amount/reference the DATABASE minted during checkout
//     initialization (§14.1), so the API surface we need is verification only.
//   * verifyTransaction is the "faster feedback" recovery path; the webhook
//     stays the durable source (§17.3).

import "server-only";
import { log } from "@/lib/logging/log";

const PAYSTACK_API = "https://api.paystack.co";
const VERIFY_TIMEOUT_MS = 8000;

export type PaystackVerification = {
  status: "success" | "failed" | "abandoned" | "pending" | "unknown";
  amountMinor: number | null;
  currency: string | null;
  reference: string | null;
  transactionId: number | null;
};

export class PaystackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackApiError";
  }
}

/**
 * Verify a transaction server-to-server with the SECRET key. The response is
 * the ONLY payment truth the browser-recovery path may act on; the caller
 * compares it against the DB order before finalizing.
 */
export async function verifyTransaction(
  reference: string
): Promise<PaystackVerification> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new PaystackApiError("PAYSTACK_SECRET_KEY is not configured");

  // Reference is [A-Z0-9_-]{8,64} per our own minting rules; re-assert here
  // because this string lands in a URL built for the provider.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(reference)) {
    throw new PaystackApiError("Malformed payment reference");
  }

  let response: Response;
  try {
    response = await fetch(
      `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          authorization: `Bearer ${secret}`,
          accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      }
    );
  } catch (error) {
    log.error("paystack.verify_network_error", { kind: "PaystackApiError" });
    throw new PaystackApiError("Could not reach Paystack");
  }

  if (!response.ok) {
    log.error("paystack.verify_http_error", { status: response.status });
    throw new PaystackApiError(`Paystack responded ${response.status}`);
  }

  const payload = (await response.json()) as {
    status?: boolean;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      reference?: string;
      id?: number;
    };
  };

  if (!payload.status || !payload.data) {
    throw new PaystackApiError("Unexpected verification payload");
  }

  const status = payload.data.status;
  return {
    status:
      status === "success" ||
      status === "failed" ||
      status === "abandoned" ||
      status === "pending"
        ? status
        : "unknown",
    amountMinor:
      typeof payload.data.amount === "number" ? payload.data.amount : null,
    currency: payload.data.currency ?? null,
    reference: payload.data.reference ?? null,
    transactionId: typeof payload.data.id === "number" ? payload.data.id : null,
  };
}
