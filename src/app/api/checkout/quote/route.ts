// src/app/api/checkout/quote/route.ts
// Blueprint §12.1 — the fifteen responsibilities of the quote endpoint.
// The browser sends ids/quantities/address ONLY; prices, shipping, FX rates,
// charge currency, and hashes are computed here or inside the SECURITY
// DEFINER RPC (0005_checkout.sql) from catalog rows.

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { parseBody, quoteRequestSchema } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveFxRates, FxUnavailableError } from "@/lib/currency/fx";
import {
  buildConversionDisclosure,
  resolvePaystackChargeCurrency,
} from "@/lib/payments/currency-adapter";
import { clientSafeDbError, log } from "@/lib/logging/log";
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { computeDemoQuote } from "@/lib/demo/quote";
import type { QuoteResponse } from "@/types/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await preflightJson<unknown>({
    request,
    rateKey: "checkout/quote",
    requireAuth: true,
    parse: (raw) => parseBody(quoteRequestSchema, raw),
  });
  if (!guard.ok) return guard.response;

  const { displayCurrency, address, lines } =
    quoteRequestSchema.parse(guard.body);

  // Offline demo path (UI testing only): same id-based contract — the
  // server re-prices from the demo catalog and refuses anything unknown.
  // NEVER reachable in production without DEMO_FALLBACK=1 (the preflight
  // would have returned 401/500 instead of a DEMO caller).
  if (guard.userId === DEMO_USER_ID) {
    const demoFx = await resolveFxRates().catch(() => null);
    const demoCharge = resolvePaystackChargeCurrency(displayCurrency);
    const result = computeDemoQuote({
      lines,
      address,
      displayCurrency,
      chargeCurrency: demoCharge,
      fx: { rates: demoFx?.rates ?? {} },
      ttlSeconds: Number(process.env.CHECKOUT_QUOTE_TTL_SECONDS ?? 600),
      disclosureFor: (display, charge) =>
        buildConversionDisclosure(display, charge),
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    log.warn("quote.demo_mode", { lines: lines.length });
    return NextResponse.json(result.quote);
  }

  // (10)(11)(12) display + charge resolution and CURRENT server-side rates.
  let fx;
  try {
    fx = await resolveFxRates();
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      return NextResponse.json(
        { error: "Exchange rates are temporarily unavailable; retry shortly" },
        { status: 503 }
      );
    }
    throw error;
  }

  const chargeCurrency = resolvePaystackChargeCurrency(displayCurrency);
  const rateDisplay =
    displayCurrency === "NGN" ? 1 : fx.rates[displayCurrency];
  const rateCharge = chargeCurrency === "NGN" ? 1 : fx.rates[chargeCurrency];

  if (!rateDisplay || !rateCharge) {
    // Fail loudly; never quote with an assumed rate (test 19.2).
    log.error("fx.rate_missing_at_quote", {
      displayCurrency,
      chargeCurrency,
    });
    return NextResponse.json(
      { error: "Exchange rate unavailable for the selected currency" },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();

  // (1)(3)-(9)(13)-(14): validation, catalog math, rounding, and persistence
  // all happen inside the definer RPC under the CALLER's JWT (auth.uid()).
  const { data, error } = await supabase.rpc("create_quote", {
    p_lines: lines,
    p_address: address,
    p_display_currency: displayCurrency,
    p_charge_currency: chargeCurrency,
    p_base_to_display: rateDisplay,
    p_base_to_charge: rateCharge,
    p_rate_provider: fx.provider,
    p_ttl_seconds: Number(process.env.CHECKOUT_QUOTE_TTL_SECONDS ?? 600),
  });

  if (error || !data?.[0]) {
    const mapped = clientSafeDbError(
      error ?? { code: "P0001", message: "Quote could not be created" }
    );
    log.warn("quote.rejected", { code: error?.code ?? "no_data" });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const row = data[0] as Record<string, string | number | null>;

  // (15) Client response — the §12.2 shape, minor units + disclosure.
  const quote: QuoteResponse = {
    quoteId: String(row.quote_id),
    displayCurrency: String(row.display_currency) as QuoteResponse["displayCurrency"],
    chargeCurrency: String(row.charge_currency) as QuoteResponse["chargeCurrency"],
    subtotalDisplayMinor: Number(row.subtotal_display_minor),
    shippingDisplayMinor: Number(row.shipping_display_minor),
    totalDisplayMinor: Number(row.total_display_minor),
    totalChargeMinor: Number(row.total_charge_minor),
    zoneCode: String(row.zone_code),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    conversionDisclosure: buildConversionDisclosure(
      String(row.display_currency) as QuoteResponse["displayCurrency"],
      String(row.charge_currency) as QuoteResponse["chargeCurrency"]
    ),
  };

  return NextResponse.json(quote);
}
