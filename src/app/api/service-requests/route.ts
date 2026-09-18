// src/app/api/service-requests/route.ts
// Blueprint §11.2 — with the §18.4 guardrails layered on top. The insert
// goes through the CUSTOMER-scoped RLS policies (status pinned to
// 'requested' by service_requests_create_own) and the ensure_booking_service
// trigger; this handler adds input validation, rate limiting, and honest
// error mapping. It NEVER touches the cart/order domain (§2.4).

import { NextResponse } from "next/server";
import { preflightJson } from "@/app/api/_security";
import { parseBody, serviceRequestSchema } from "@/lib/validation/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clientSafeDbError, log } from "@/lib/logging/log";
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { demoServiceRequestTicket } from "@/lib/demo/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await preflightJson<unknown>({
    request,
    rateKey: "service-requests",
    requireAuth: true,
    parse: (raw) => parseBody(serviceRequestSchema, raw),
  });
  if (!guard.ok) return guard.response;

  const body = serviceRequestSchema.parse(guard.body);
  const userId = guard.userId!;

  // Offline demo path: validate against the demo catalog and hand back a
  // clearly-marked demo ticket so the whole wizard flow is testable.
  if (userId === DEMO_USER_ID) {
    const ticket = demoServiceRequestTicket(body.serviceId);
    if ("error" in ticket) {
      return NextResponse.json({ error: ticket.error }, { status: ticket.status });
    }
    log.warn("service_request.demo_mode", { serviceId: body.serviceId });
    return NextResponse.json(ticket, { status: 201 });
  }

  const supabase = await createServerSupabaseClient();

  // Server-side revalidation (§3.3): the service must be an ACTIVE BOOKING
  // service as seen through this customer's RLS-scoped read. (The DB trigger
  // is the hard boundary; this check produces the cleaner error message.)
  const { data: service } = await supabase
    .from("services")
    .select("id, kind, is_active")
    .eq("id", body.serviceId)
    .maybeSingle();

  if (!service || !service.is_active) {
    return NextResponse.json({ error: "Service not found or inactive" }, {
      status: 404,
    });
  }
  if (service.kind !== "booking") {
    return NextResponse.json(
      { error: "Only bookable services can be requested here; purchasable add-ons belong in the cart" },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      user_id: userId,
      service_id: body.serviceId,
      status: "requested",
      requested_start_at: body.requestedStartAt ?? null,
      requested_end_at: body.requestedEndAt ?? null,
      site_address: body.siteAddress,
      notes: body.notes ?? null,
    })
    .select("id, request_number, status")
    .single();

  if (error) {
    // request_number is assigned by trigger; unique-violation here means a
    // replay, which the daily sequence makes vanishingly unlikely — but map
    // it honestly regardless.
    const mapped = clientSafeDbError(error);
    log.warn("service_request.rejected", { code: error.code });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json(
    {
      id: data.id,
      requestNumber: data.request_number,
      status: data.status,
    },
    { status: 201 }
  );
}
