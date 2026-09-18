// src/lib/validation/schemas.ts
// Zod schemas per blueprint §17/§18.4. Every API boundary parses through
// these BEFORE touching the database. Prices are absent from every schema —
// the client physically cannot propose an amount.

import { z } from "zod";
import { CURRENCY_CODES } from "@/types/catalog";

export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Must be a UUID"
  );

export const shippingAddressSchema = z.object({
  country: z.string().trim().length(2, "Use an ISO 3166-1 alpha-2 code"),
  state: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  addressLine1: z.string().trim().min(5).max(240),
  addressLine2: z.string().trim().max(240).optional(),
  postalCode: z.string().trim().max(16).optional(),
});

export const checkoutLineSchema = z
  .object({
    clientLineId: z.string().min(1).max(64),
    kind: z.enum(["product", "service_addon"]),
    productId: uuidSchema.optional(),
    serviceId: uuidSchema.optional(),
    parentClientLineId: z.string().min(1).max(64).optional(),
    quantity: z.number().int().min(1).max(999),
  })
  .superRefine((line, ctx) => {
    if (line.kind === "product" && !line.productId) {
      ctx.addIssue({ code: "custom", path: ["productId"], message: "product lines need productId" });
    }
    if (line.kind === "service_addon") {
      if (!line.serviceId) {
        ctx.addIssue({ code: "custom", path: ["serviceId"], message: "add-on lines need serviceId" });
      }
      if (!line.parentClientLineId) {
        ctx.addIssue({ code: "custom", path: ["parentClientLineId"], message: "add-ons must attach to a product line" });
      }
    }
  });

export const quoteRequestSchema = z.object({
  displayCurrency: z.enum(CURRENCY_CODES),
  address: shippingAddressSchema,
  lines: z.array(checkoutLineSchema).min(1).max(100),
});

export const checkoutInitializeSchema = z.object({
  quoteId: uuidSchema,
  // Idempotency key (§18.4): client-generated per checkout attempt; the DB
  // replays the same order for (user, key).
  idempotencyKey: z.string().min(8).max(64),
  lines: z.array(checkoutLineSchema).min(1).max(100),
  shippingAddress: shippingAddressSchema,
});

export const paymentVerifySchema = z.object({
  orderId: uuidSchema,
  reference: z.string().min(8).max(64),
});

export const serviceRequestSchema = z
  .object({
    serviceId: uuidSchema,
    requestedStartAt: z.string().datetime().optional(),
    requestedEndAt: z.string().datetime().optional(),
    siteAddress: shippingAddressSchema,
    notes: z.string().trim().max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.requestedStartAt && value.requestedEndAt) {
      if (
        Date.parse(value.requestedEndAt) <= Date.parse(value.requestedStartAt)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["requestedEndAt"],
          message: "Window end must be after its start",
        });
      }
    }
    if (value.requestedStartAt && Date.parse(value.requestedStartAt) < Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedStartAt"],
        message: "Bookings must be scheduled in the future",
      });
    }
  });

/** Safe-parse helper producing uniform route error payloads. */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown
): { ok: true; data: z.infer<T> } | { ok: false; issues: string[] } {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
    ),
  };
}
