// src/app/api/checkout/initialize/route.ts
// Blueprint §14.3 + §15.4: the ATOMIC order + items insert happens inside
// create_order_from_quote BEFORE Paystack ever opens. This handler adds the
// abuse guardrails, the idempotency key (§18.4), and the exact inline
// session payload the PaystackButton consumes.

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { checkoutInitializeSchema, parseBody } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { clientSafeDbError, log } from "@/lib/logging/log";

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

  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!publicKey) {
    log.error("checkout.public_key_missing");
    return NextResponse.json(
      { error: "Payments are not configured yet" },
      { status: 500 }
    );
  }

  // The browser charges EXACTLY these server-minted values (§2.5: the
  // browser never decides the amount).
  return NextResponse.json({
    orderId: String(order.order_id),
    paymentReference: String(order.payment_reference),
    displayCurrency: String(order.display_currency),
    chargeCurrency: String(order.charge_currency),
    amountMinor: Number(order.total_charge_minor),
    reused: Boolean(order.reused),
    publicKey,
  });
}
