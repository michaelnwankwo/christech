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
