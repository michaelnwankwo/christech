"use client";

// src/components/services/BookingSummary.tsx — read-only digest of the draft
// shown on the review step. Pure rendering; no cart imports anywhere near it.

import { useBookingDraftStore } from "@/stores/booking-draft-store";
import { formatMinorMoney } from "@/lib/currency/money";
import type { ServiceVM } from "@/types/catalog";

export function BookingSummary({ service }: { service: ServiceVM | null }) {
  const draft = useBookingDraftStore((s) => s.draft);

  return (
    // Layout + type live in globals.css (.booking-summary): 1.25rem field
    // gaps, semibold slate-900 labels, slate-600 relaxed values.
    <dl className="booking-summary">
      <dt>Service</dt>
      <dd>{service?.name ?? "—"}</dd>

      <dt>Indicative price</dt>
      <dd className="mono">
        {service
          ? `${formatMinorMoney(service.basePriceMinor, "NGN")} (final quote by staff)`
          : "—"}
      </dd>

      <dt>Time window</dt>
      <dd>
        {draft.requestedStartAt
          ? `${formatWhen(draft.requestedStartAt)}${
              draft.requestedEndAt ? ` → ${formatWhen(draft.requestedEndAt)}` : ""
            }`
          : "Flexible"}
      </dd>

      <dt>Location</dt>
      <dd>
        {draft.siteAddress
          ? `${draft.siteAddress.addressLine1}, ${draft.siteAddress.city}, ${draft.siteAddress.state}`
          : "—"}
      </dd>

      {draft.notes ? (
        <>
          <dt>Notes</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{draft.notes}</dd>
        </>
      ) : null}
    </dl>
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
