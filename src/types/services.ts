// src/types/services.ts
// The SERVICE domain types. A booking never references an order and never
// carries payment state (blueprint §2.4 + §11.3).

export type ServiceRequestStatus =
  | "requested"
  | "under_review"
  | "quoted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected";

export const SERVICE_REQUEST_STATUS_LABELS: Record<
  ServiceRequestStatus,
  string
> = {
  requested: "Requested",
  under_review: "Under review",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export type SiteAddress = {
  country: string;
  state: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode?: string;
};

export type ServiceRequestVM = {
  id: string;
  requestNumber: string;
  status: ServiceRequestStatus;
  serviceName: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  estimatedPriceMinor: number | null;
  notes: string | null;
  createdAt: string;
};

export type ServiceRequestCreateResponse = {
  id: string;
  requestNumber: string;
  status: ServiceRequestStatus;
};

// ---------------------------------------------------------------------------
// Quote-on-Demand via WhatsApp (guest-accessible service quote requests)
// ---------------------------------------------------------------------------

/** Inspection time windows offered in the quote modal + WhatsApp payload. */
export const QUOTE_TIME_WINDOWS = [
  "Morning (08:00 – 11:00)",
  "Midday (11:00 – 14:00)",
  "Afternoon (14:00 – 17:00)",
  "Flexible / Any time",
] as const;
export type QuoteTimeWindow = (typeof QUOTE_TIME_WINDOWS)[number];

/** Human-readable estimated duration; NEVER a price (custom quote only). */
export function formatServiceDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "Duration to be confirmed";
  if (minutes < 60) return `≈ ${minutes} min on site`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `≈ ${h} h on site` : `≈ ${h} h ${m} min on site`;
}

/** POST /api/service-quote-requests success body. */
export type ServiceQuoteRequestCreateResponse = {
  id: string;
  quoteReference: string;
  status: "new" | "contacted" | "quoted" | "won" | "lost" | "spam";
};
