// src/lib/logging/log.ts
// Structured, PII-safe logging (§18.3). NEVER passes raw addresses, emails,
// cart contents, or payment payloads to the sink: call sites log identifiers
// and outcome codes only. Swap the sink (console → pino/Axiom/Datadog) here.

type Fields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields) {
  // Single-line JSON keeps platform log search usable.
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  /** error() takes a message + safe fields; do NOT forward Error.message from
   *  upstream services (may echo request bodies) without review. */
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};

/** Maps raw PostgREST/Postgres errors to client-safe text; full detail goes
 *  to the log with the error CODE only (messages can contain row data). */
export function clientSafeDbError(error: {
  code?: string;
  message?: string;
}): { status: number; message: string } {
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "42501") return { status: 403, message: "Not permitted" };

  if (code === "P0001") {
    // Business rules raised by our own functions — messages are authored
    // server-side and safe verbatim.
    return { status: 422, message };
  }

  if (code === "23505") return { status: 409, message: "Duplicate submission" };
  if (code === "23503")
    return { status: 422, message: "Referenced record is invalid" };

  return { status: 400, message: "Request could not be processed" };
}
