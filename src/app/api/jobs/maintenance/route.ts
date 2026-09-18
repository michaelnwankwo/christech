// src/app/api/jobs/maintenance/route.ts
// Blueprint §20.4 scheduled jobs, exposed for Vercel Cron / any scheduler.
// Auth: bearer CRON_SECRET (compared in constant time). Each job is an
// idempotent SQL function — safe to run every 5 minutes:
//   cancel_expired_unpaid_orders()      — releases reserved stock
//   purge_expired_quotes()              — stale currency_quotes cleanup
//   archive_payment_event_payloads(90)  — payment-event PII hygiene
// Optional manual invocation:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/jobs/maintenance

import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { log } from "@/lib/logging/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const limit = checkRateLimit("maintenance", "cron");
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!authorized(request)) {
    log.warn("maintenance.unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const [cancelled, purged, archived] = await Promise.all([
    admin.rpc("cancel_expired_unpaid_orders"),
    admin.rpc("purge_expired_quotes"),
    admin.rpc("archive_payment_event_payloads", { p_keep_days: 90 }),
  ]);

  const failures = [cancelled, purged, archived].filter((r) => r.error);
  if (failures.length > 0) {
    log.error("maintenance.job_failed", { failed: failures.length });
    return NextResponse.json({ error: "One or more jobs failed" }, { status: 500 });
  }

  return NextResponse.json({
    expiredOrdersCancelled: cancelled.data,
    staleQuotesPurged: purged.data,
    paymentPayloadsArchived: archived.data,
    ranAt: new Date().toISOString(),
  });
}
