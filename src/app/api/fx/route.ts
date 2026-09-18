// src/app/api/fx/route.ts
// DISPLAY-ONLY rate endpoint for the currency picker. Checkout never reads
// rates from the browser: /api/checkout/quote fetches the SAME module
// server-side and freezes them into the quote row (§13.3).

import { NextResponse } from "next/server";
import { resolveFxRates, FxUnavailableError } from "@/lib/currency/fx";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/security/rate-limit";
import { rateLimitedResponse } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = checkRateLimit("fx", request.headers.get("x-real-ip") ?? "anon");
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  try {
    const snapshot = await resolveFxRates();
    return NextResponse.json(
      {
        base: "NGN",
        rates: snapshot.rates,
        provider: snapshot.provider,
        fetchedAt: new Date(snapshot.fetchedAtMs).toISOString(),
      },
      {
        headers: {
          // Short public cache is fine for display; quotes bypass it.
          "cache-control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      return NextResponse.json({ error: "Rates unavailable" }, { status: 503 });
    }
    throw error;
  }
}
