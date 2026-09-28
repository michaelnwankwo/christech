import { describe, expect, it } from "vitest";
import { clientSafeDbError } from "@/lib/logging/log";

describe("clientSafeDbError", () => {
  it("identifies missing checkout RPC/schema migrations as service errors", () => {
    for (const code of ["PGRST202", "42883", "42P01", "42703"]) {
      expect(clientSafeDbError({ code, message: "raw detail" })).toEqual({
        status: 503,
        message:
          "Checkout pricing is not initialized; site operators must apply the latest database migrations",
      });
    }
  });

  it("does not expose unknown database messages", () => {
    expect(clientSafeDbError({ code: "XX000", message: "sensitive row detail" }))
      .toEqual({
        status: 400,
        message: "The quote could not be created; check the cart and delivery address",
      });
  });
});
