"use client";

// src/components/services/BookingSummary.tsx — read-only digest of the draft
// shown on the review step. Pure rendering; no cart imports anywhere near it.

import { useBookingDraftStore } from "@/stores/booking-draft-store";
import { formatMinorMoney } from "@/lib/currency/money";
import type { ServiceVM } from "@/types/catalog";

export function BookingSummary({ service }: { service: ServiceVM | null }) {
  const draft = useBookingDraftStore((s) => s.draft);

  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: ".35rem .9rem",
        margin: 0,
        fontSize: ".92rem",
      }}
    >
      <dt className="muted">Service</dt>
      <dd style={{ margin: 0 }}>{service?.name ?? "—"}</dd>

      <dt className="muted">Indicative price</dt>
      <dd style={{ margin: 0 }} className="mono">
        {service
          ? `${formatMinorMoney(service.basePriceMinor, "NGN")} (final quote by staff)`
          : "—"}
      </dd>

      <dt className="muted">Window</dt>
      <dd style={{ margin: 0 }}>
        {draft.requestedStartAt
          ? `${formatWhen(draft.requestedStartAt)}${
              draft.requestedEndAt ? ` → ${formatWhen(draft.requestedEndAt)}` : ""
            }`
          : "Flexible"}
      </dd>

      <dt className="muted">Site</dt>
      <dd style={{ margin: 0 }}>
        {draft.siteAddress
          ? `${draft.siteAddress.addressLine1}, ${draft.siteAddress.city}, ${draft.siteAddress.state}`
          : "—"}
      </dd>

      {draft.notes ? (
        <>
          <dt className="muted">Notes</dt>
          <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{draft.notes}</dd>
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
