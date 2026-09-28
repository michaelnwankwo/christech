// src/app/api/checkout/initialize/route.ts
// Blueprint §14.3 + §15.4: the ATOMIC order + items insert happens inside
// create_order_from_quote BEFORE Paystack ever opens. This handler adds the
// abuse guardrails, the idempotency key (§18.4), and the exact inline
// session payload the PaystackButton consumes.

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { checkoutInitializeSchema, parseBody } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { clientSafeDbError, log } from "@/lib/logging/log";
import {
  initializeTransaction,
  PaystackApiError,
  type PaystackInitialization,
} from "@/lib/payments/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await preflightJson<unknown>({
    request,
    rateKey: "checkout/initialize",
    requireAuth: true,
    parse: (raw) => parseBody(checkoutInitializeSchema, raw),
  });
  if (!guard.ok) return guard.response;

  // Money must never move on demo data: orders+Paystack initialization stay
  // database-only. Demo UI shows a disabled pay button with this reason.
  if (guard.userId === DEMO_USER_ID) {
    return NextResponse.json(
      {
        error:
          "Checkout to Paystack is disabled while the database is offline (demo mode).",
      },
      { status: 503 }
    );
  }

  const body = checkoutInitializeSchema.parse(guard.body);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("create_order_from_quote", {
    p_quote_id: body.quoteId,
    p_lines: body.lines,
    p_shipping_address: body.shippingAddress,
    p_idempotency_key: body.idempotencyKey,
  });

  if (error || !data?.[0]) {
    const mapped = clientSafeDbError(
      error ?? { code: "P0001", message: "Unable to create checkout order" }
    );
    log.warn("checkout.initialize_rejected", {
      code: error?.code ?? "no_data",
      userId: guard.userId,
    });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const order = data[0] as Record<string, string | number | boolean>;
  const orderId = String(order.order_id);
  const paymentReference = String(order.payment_reference);
  const amountMinor = Number(order.total_charge_minor);
  const chargeCurrency = String(order.charge_currency);
  const displayCurrency = String(order.display_currency);

  // Read the server-side email snapshot and any previously initialized
  // Paystack checkout. The latter makes an idempotent initialize retry reuse
  // the same one-time access code instead of submitting a duplicate reference.
  const { data: orderSnapshot, error: snapshotError } = await supabase
    .from("orders")
    .select("customer_email_snapshot, metadata")
    .eq("id", orderId)
    .maybeSingle();

  if (snapshotError || !orderSnapshot) {
    log.error("checkout.order_snapshot_missing", { orderId });
    return NextResponse.json(
      { error: "The payment session could not be prepared" },
      { status: 500 }
    );
  }

  const metadata = asRecord(orderSnapshot.metadata);
  let paystack = readStoredPaystackCheckout(
    metadata.paystack_checkout,
    paymentReference
  );

  if (!paystack) {
    try {
      paystack = await initializeTransaction({
        email: String(orderSnapshot.customer_email_snapshot ?? ""),
        amountMinor,
        currency: chargeCurrency,
        reference: paymentReference,
        callbackUrl: new URL(`/account/orders/${orderId}`, request.url).toString(),
        metadata: {
          order_id: orderId,
          display_currency: displayCurrency,
        },
      });
    } catch (error) {
      log.error("checkout.paystack_initialize_failed", {
        reason: error instanceof PaystackApiError ? "provider" : "unexpected",
        orderId,
      });
      return NextResponse.json(
        { error: "Paystack is temporarily unavailable; please retry" },
        { status: 502 }
      );
    }

    // Persist the provider session for safe idempotent retries. Failure to
    // persist does not discard a valid checkout response for this request;
    // it is logged so operations can reconcile the pending order.
    const admin = createAdminSupabaseClient();
    const { error: metadataError } = await admin
      .from("orders")
      .update({
        metadata: {
          ...metadata,
          paystack_checkout: {
            authorization_url: paystack.authorizationUrl,
            access_code: paystack.accessCode,
            reference: paystack.reference,
            initialized_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", orderId);

    if (metadataError) {
      log.error("checkout.paystack_session_persist_failed", {
        code: metadataError.code,
        orderId,
      });
    }
  }

  // The browser receives only the provider access code/URL plus values already
  // frozen on the order. It cannot propose or change the amount or currency.
  return NextResponse.json({
    orderId,
    paymentReference,
    displayCurrency,
    chargeCurrency,
    amountMinor,
    reused: Boolean(order.reused),
    accessCode: paystack.accessCode,
    authorizationUrl: paystack.authorizationUrl,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStoredPaystackCheckout(
  value: unknown,
  expectedReference: string
): PaystackInitialization | null {
  const stored = asRecord(value);
  const authorizationUrl = stored.authorization_url;
  const accessCode = stored.access_code;
  const reference = stored.reference;

  if (
    typeof authorizationUrl !== "string" ||
    typeof accessCode !== "string" ||
    typeof reference !== "string" ||
    reference !== expectedReference ||
    accessCode.length < 6
  ) {
    return null;
  }

  try {
    const parsed = new URL(authorizationUrl);
    if (
      parsed.protocol !== "https:" ||
      !(
        parsed.hostname === "checkout.paystack.com" ||
        parsed.hostname.endsWith(".paystack.com")
      )
    ) {
      return null;
    }
    return {
      authorizationUrl: parsed.toString(),
      accessCode,
      reference,
    };
  } catch {
    return null;
  }
}
