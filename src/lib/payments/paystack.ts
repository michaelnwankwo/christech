// src/lib/payments/paystack.ts
// Server-side Paystack adapter.
//   * Transactions are initialized here with the SECRET key and the exact
//     amount/reference minted by the database. The browser receives only an
//     access code + Paystack-hosted authorization URL.
//   * verifyTransaction is the "faster feedback" recovery path; the webhook
//     stays the durable source (§17.3).

import "server-only";
import { log } from "@/lib/logging/log";

const PAYSTACK_API = "https://api.paystack.co";
const PAYSTACK_TIMEOUT_MS = 8000;

export type PaystackInitialization = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

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
 * Initialize a transaction server-to-server. This is the only code allowed to
 * send charge parameters to Paystack; all values are database snapshots, not
 * browser-proposed amounts. The returned authorization URL is also the mobile
 * and content-blocker fallback when InlineJS cannot render its iframe.
 */
export async function initializeTransaction(input: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<PaystackInitialization> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new PaystackApiError("PAYSTACK_SECRET_KEY is not configured");

  if (!input.email || !input.email.includes("@") || input.email.length > 320) {
    throw new PaystackApiError("A valid customer email is required");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new PaystackApiError("Payment amount must be a positive minor-unit integer");
  }
  if (!new Set(["NGN", "USD"]).has(input.currency)) {
    throw new PaystackApiError("Unsupported Paystack charge currency");
  }
  if (!/^[A-Za-z0-9_.=-]{8,64}$/.test(input.reference)) {
    throw new PaystackApiError("Malformed payment reference");
  }

  let callback: URL;
  try {
    callback = new URL(input.callbackUrl);
  } catch {
    throw new PaystackApiError("Malformed payment callback URL");
  }
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
    throw new PaystackApiError("Payment callback URL must use HTTPS");
  }

  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: String(input.amountMinor),
        currency: input.currency,
        reference: input.reference,
        callback_url: callback.toString(),
        metadata: input.metadata,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
    });
  } catch {
    log.error("paystack.initialize_network_error", { kind: "PaystackApiError" });
    throw new PaystackApiError("Could not reach Paystack");
  }

  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    data?: {
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    };
  } | null;

  if (!response.ok || !payload?.status || !payload.data) {
    log.error("paystack.initialize_http_error", { status: response.status });
    throw new PaystackApiError(`Paystack initialization responded ${response.status}`);
  }

  const authorizationUrl = payload.data.authorization_url ?? "";
  const accessCode = payload.data.access_code ?? "";
  const reference = payload.data.reference ?? "";
  let authorization: URL;
  try {
    authorization = new URL(authorizationUrl);
  } catch {
    throw new PaystackApiError("Paystack returned a malformed authorization URL");
  }

  if (
    authorization.protocol !== "https:" ||
    !(
      authorization.hostname === "checkout.paystack.com" ||
      authorization.hostname.endsWith(".paystack.com")
    ) ||
    accessCode.length < 6 ||
    reference !== input.reference
  ) {
    throw new PaystackApiError("Paystack returned an invalid initialization payload");
  }

  return { authorizationUrl: authorization.toString(), accessCode, reference };
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
        signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
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
