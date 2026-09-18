// src/app/api/payments/verify/route.ts
// Blueprint §17.3 recovery/faster-feedback path:
//   1 authenticate; 2 confirm ownership via RLS-scoped select; 3 confirm the
//   reference matches the stored one; 4 server-to-server verify with Paystack;
//   5 compare status/amount/currency/reference; 6 finalize through the SAME
//   core the webhook uses; 7 return database truth.
// A successful callback alone NEVER marks anything paid.

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { parseBody, paymentVerifySchema } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyTransaction, PaystackApiError } from "@/lib/payments/paystack";
import { log } from "@/lib/logging/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await preflightJson<unknown>({
    request,
    rateKey: "payments/verify",
    requireAuth: true,
    parse: (raw) => parseBody(paymentVerifySchema, raw),
  });
  if (!guard.ok) return guard.response;

  const { orderId, reference } = paymentVerifySchema.parse(guard.body);
  const supabase = await createServerSupabaseClient();

  // (2) Ownership is enforced by orders_read_own; (3) reference must match.
  const { data: orderRow } = await supabase
    .from("orders")
    .select("id, order_number, payment_reference, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!orderRow || orderRow.payment_reference !== reference) {
    return NextResponse.json({ error: "Order not found for this user" }, {
      status: 404,
    });
  }

  let verification;
  try {
    // (4) The provider confirms to OUR server, not the browser.
    verification = await verifyTransaction(reference);
  } catch (error) {
    if (error instanceof PaystackApiError) {
      return NextResponse.json(
        { error: "Payment verification is temporarily unavailable", retry: true },
        { status: 502 }
      );
    }
    throw error;
  }

  // (5)+(6) Compare & finalize via the shared core (service role only).
  const admin = createAdminSupabaseClient();
  const { data: outcome, error: finalizeError } = await admin.rpc(
    "finalize_paid_order",
    {
      p_reference: reference,
      p_amount: verification.amountMinor,
      p_currency: verification.currency,
      p_status: verification.status,
      p_transaction_id: verification.transactionId,
      p_event_id: null,
      p_source: "verify",
    }
  );

  if (finalizeError) {
    log.error("payments.verify_finalize_failed", { code: finalizeError.code });
    return NextResponse.json(
      { error: "Payment result could not be recorded" },
      { status: 500 }
    );
  }

  // (7) Return the CURRENT database state — that is the only truth UI shows.
  const { data: fresh } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status")
    .eq("id", orderId)
    .single();

  return NextResponse.json({
    orderId,
    orderNumber: fresh?.order_number ?? orderRow.order_number,
    status: fresh?.status ?? orderRow.status,
    paymentStatus: fresh?.payment_status ?? orderRow.payment_status,
    verificationOutcome: outcome,
  });
}
