// src/app/api/_security.ts
// Shared route-handler preflight: CSRF same-origin check, body size cap,
// per-caller rate limit. Extracted so every money endpoint provably uses the
// exact same guardrail stack (blueprint §18.4). Not a page; underscore-prefixed
// folder files are ignored by the App Router.

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEMO_USER_ID, databaseUnavailable, demoEligible } from "@/lib/demo/mode";
import {
  assertSameOrigin,
  clientIp,
  CrossOriginError,
  MAX_JSON_BODY_BYTES,
  PayloadTooLargeError,
  readJsonBody,
  rateLimitedResponse,
} from "@/lib/security/request";
import {
  checkRateLimit,
  RATE_LIMIT_RULES,
} from "@/lib/security/rate-limit";

export type Preflight<T> =
  | { ok: true; body: T; userId: string | null }
  | { ok: false; response: NextResponse };

export async function preflightJson<T>(options: {
  request: Request;
  rateKey: keyof typeof RATE_LIMIT_RULES;
  requireAuth: boolean;
  maxBytes?: number;
  parse?: (raw: unknown) => { ok: true; data: T } | { ok: false; issues: string[] };
}): Promise<Preflight<T>> {
  const { request, rateKey, requireAuth, maxBytes, parse } = options;

  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CrossOriginError) {
      return fail(403, "Cross-origin requests are not accepted");
    }
    throw error;
  }

  // Auth probe. An unreachable/missing database normally throws here;
  // in demo-eligible environments that is precisely the signal to serve
  // the offline flow instead of a 500 (prod without DEMO_FALLBACK keeps the
  // strict behavior — databaseUnavailable() short-circuits to false there).
  let authUserId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authUserId = user?.id ?? null;
  } catch (error) {
    if (!demoEligible()) throw error;
  }

  if (!authUserId && requireAuth) {
    if (demoEligible() && (await databaseUnavailable())) {
      authUserId = DEMO_USER_ID; // synthetic demo caller
    } else {
      return fail(401, "Authentication required");
    }
  }

  const callerKey = authUserId ?? clientIp(request);
  const limit = checkRateLimit(rateKey, callerKey);
  if (!limit.ok) {
    return { ok: false, response: rateLimitedResponse(limit.retryAfterSeconds) };
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(request, maxBytes ?? MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return fail(413, "Request body too large");
    }
    return fail(400, error instanceof Error ? error.message : "Invalid body");
  }

  if (parse) {
    const parsed = parse(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Validation failed", issues: parsed.issues },
          { status: 400 }
        ),
      };
    }
    return { ok: true, body: parsed.data, userId: authUserId };
  }

  return { ok: true, body: raw as T, userId: authUserId };
}

function fail(status: number, message: string): {
  ok: false;
  response: NextResponse;
} {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}
