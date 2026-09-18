// src/app/api/webhooks/paystack/route.ts
// Blueprint §15.1/§15.2 — the twelve-step webhook contract:
//   raw bytes → header → HMAC-SHA512 → timing-safe compare → PARSE (only
//   after verification) → idempotency key → durable event store → order
//   lock → amount/currency/reference/status checks → transactional update →
//   order event → 200 only after durable processing.
// No auth middleware runs here (see root middleware matcher); authenticity
// comes from the signature alone.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyPaystackSignature } from "@/lib/payments/signature";
import {
  MAX_WEBHOOK_BODY_BYTES,
  clientIp,
  PayloadTooLargeError,
  readRawBody,
  rateLimitedResponse,
} from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { log } from "@/lib/logging/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackEvent = {
  event?: string;
  data?: {
    id?: number;
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  const limit = checkRateLimit("webhooks/paystack", clientIp(request));
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Unreadable body" }, { status: 400 });
  }

  // (1)-(4) Signature over the RAW body, constant-time. Never parsed first.
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyPaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)) {
    log.warn("paystack.webhook_signature_rejected", {
      length: rawBody.byteLength,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // (5) Parse only after verification.
  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = typeof event.event === "string" ? event.event : "unknown";
  const data = event.data ?? {};

  // (6) Idempotency key: provider event + provider object id (or reference,
  // or the body hash as a last resort) — stable across retries (§15.3.1).
  const fallbackKey = createHash("sha256").update(rawBody).digest("hex");
  const eventKey = `${eventType}:${data.id ?? data.reference ?? fallbackKey}`;

  // (7)-(11) Journaling, order lock, comparison, transactional finalization,
  // and audit event all happen inside process_paystack_event (0006), in one
  // Postgres transaction. Line items are NEVER reconstructed from this
  // payload — the order already exists (§15.4).
  const admin = createAdminSupabaseClient();
  const { data: outcome, error } = await admin.rpc("process_paystack_event", {
    p_event_key: eventKey,
    p_event_type: eventType,
    p_reference: typeof data.reference === "string" ? data.reference : null,
    p_amount: typeof data.amount === "number" ? data.amount : null,
    p_currency: typeof data.currency === "string" ? data.currency : null,
    p_status: typeof data.status === "string" ? data.status : null,
    p_payload: event,
    p_signature_verified: true,
  });

  if (error) {
    // Non-2xx makes Paystack retry — correct for transient DB faults.
    log.error("paystack.webhook_processing_failed", { code: error.code });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  // (12) Durable processing confirmed; answer 200 (duplicates included:
  // §19.3 "duplicate webhook is idempotent").
  log.info("paystack.webhook_processed", { outcome: String(outcome) });
  return NextResponse.json({ received: true });
}
