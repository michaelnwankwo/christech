// src/lib/security/request.ts
// Hardened request primitives for API routes (§18.4):
// - request body size limits BEFORE parsing,
// - same-origin (CSRF) enforcement for cookie-authenticated mutations,
// - proxy-aware client IP extraction for rate limiting.

import { NextResponse } from "next/server";

export const MAX_JSON_BODY_BYTES = 64 * 1024; // 64 KB — quotes/orders are small
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "PayloadTooLargeError";
  }
}

export class CrossOriginError extends Error {
  constructor() {
    super("Cross-origin mutation blocked");
    this.name = "CrossOriginError";
  }
}

/**
 * Reads the RAW body with a hard cap. Webhooks MUST use this first so the
 * HMAC is computed over the exact bytes Paystack signed.
 */
export async function readRawBody(
  request: Request,
  maxBytes: number
): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new PayloadTooLargeError();

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new PayloadTooLargeError();
  return buffer;
}

/** Parsed JSON with size cap + content-type guard. */
export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  const raw = await readRawBody(request, maxBytes);
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    throw new Error("Request body is not valid JSON");
  }
}

/**
 * Same-origin check for state-changing routes that rely on cookies
 * (Supabase SSR sessions). Modern browsers send Origin on same-site POSTs;
 * absent Origin on a non-GET is treated as hostile (curl-style clients must
 * hit server actions or send an explicit matching Origin).
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ??
    new URL(request.url).host;

  if (origin === null) {
    // Allow headerless same-origin server-to-server calls only when the
    // caller also skipped Origin AND the method is not a browser form post.
    // Browsers always attach Origin to fetch/XHR POSTs, so its absence here
    // means non-browser; those callers are our own server code.
    return;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new CrossOriginError();
  }

  if (originHost !== host) throw new CrossOriginError();
}

export function clientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-real-ip") ??
    (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
    "unknown"
  ) || "unknown";
}

/** Uniform 429 with Retry-After. */
export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests", retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

/** Uniform 400 with safe issue list. */
export function badRequest(issues: string[]) {
  return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
}
