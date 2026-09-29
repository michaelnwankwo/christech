// src/app/api/service-quote-requests/route.ts
// Quote-on-Demand via WhatsApp — GUEST-accessible lead capture (§11
// extension). Unlike /api/service-requests this does NOT require auth: the
// row lands in service_quote_requests (0014) whose RLS allows anon INSERT
// only, status pinned to 'new'. The record is written BEFORE WhatsApp opens
// so every dispatched lead carries an auditable QUOTE-* reference and no
// lead is ever lost to a closed tab. Still zero price fields — the client
// physically cannot propose an amount.

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { parseBody, serviceQuoteRequestSchema } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clientSafeDbError, log } from "@/lib/logging/log";
import { databaseUnavailable, demoEligible } from "@/lib/demo/mode";
import { formatServiceDuration } from "@/types/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await preflightJson<unknown>({
    request,
    rateKey: "service-quote-requests",
    requireAuth: false,
    parse: (raw) => parseBody(serviceQuoteRequestSchema, raw),
  });
  if (!guard.ok) return guard.response;

  const body = serviceQuoteRequestSchema.parse(guard.body);

  // Offline demo path (dev only): hand back a clearly-marked demo reference
  // so the whole WhatsApp flow stays testable without a database. Production
  // is fail-closed — demoEligible() is false there and this branch is dead.
  if (demoEligible() && (await databaseUnavailable())) {
    log.warn("service_quote_request.demo_mode", { serviceId: body.serviceId });
    return NextResponse.json(
      {
        id: crypto.randomUUID(),
        quoteReference: `QUOTE-DEMO-${Date.now().toString(36).toUpperCase()}`,
        status: "new",
      },
      { status: 201 }
    );
  }

  const supabase = await createServerSupabaseClient();

  // Optional session: guests stay anonymous; signed-in customers get their
  // row linked for account-side tracking. preflightJson already probed auth,
  // but with requireAuth=false it does not expose the id — re-read it here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Server-side revalidation: the service must be an ACTIVE BOOKING service.
  // The snapshot columns (title/code/duration) are derived HERE from the DB —
  // the client never dictates what the WhatsApp message will claim.
  const { data: service } = await supabase
    .from("services")
    .select("id, slug, name, duration_minutes, kind, is_active")
    .eq("id", body.serviceId)
    .maybeSingle();

  if (!service || !service.is_active) {
    return NextResponse.json(
      { error: "Service not found or inactive" },
      { status: 404 }
    );
  }
  if (service.kind !== "booking") {
    return NextResponse.json(
      {
        error:
          "Only bookable services can be quoted here; purchasable add-ons belong in the cart",
      },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("service_quote_requests")
    .insert({
      user_id: user?.id ?? null,
      service_id: service.id,
      service_title: String(service.name),
      service_code: String(service.slug),
      estimated_duration: formatServiceDuration(
        service.duration_minutes === null ||
          service.duration_minutes === undefined
          ? null
          : Number(service.duration_minutes)
      ),
      customer_name: body.customerName,
      customer_phone: body.customerPhone,
      customer_email: body.customerEmail,
      site_address: body.siteAddress,
      preferred_date: body.preferredDate,
      time_window: body.timeWindow,
      site_notes: body.siteNotes ?? null,
      status: "new",
      metadata: {
        source: "services_page_modal",
        channel: "whatsapp",
        authenticated: Boolean(user),
      },
    })
    .select("id, quote_reference, status")
    .single();

  if (error) {
    // quote_reference is assigned by trigger; a unique violation means a
    // replayed submit — map it honestly, never lose the reason server-side.
    const mapped = clientSafeDbError(error);
    log.warn("service_quote_request.rejected", { code: error.code });
    return NextResponse.json(
      { error: mapped.message },
      { status: mapped.status }
    );
  }

  return NextResponse.json(
    {
      id: data.id,
      quoteReference: data.quote_reference,
      status: data.status,
    },
    { status: 201 }
  );
}
