import Link from "next/link";
import type { ServiceVM } from "@/types/catalog";
import { formatServiceDuration } from "@/types/services";
import { ServiceQuoteButton } from "./ServiceQuoteButton";

// src/components/services/ServiceCard.tsx
// §11.3: duration + scheduling requirements are shown; status is never
// represented as payment status; there is no "add to cart" anywhere here.
//
// QUOTE-ON-DEMAND: baseline prices ("From ₦…") are GONE. Every card routes
// through the WhatsApp quote modal — the only pricing model shown anywhere
// is "Custom quote required", priced by staff after site review.

export function ServiceCard({ service }: { service: ServiceVM }) {
  return (
    <article className="service-card surface-card">
      <h3>
        <Link href={`/services/${service.slug}`}>{service.name}</Link>
      </h3>
      {service.description ? (
        <p className="muted" style={{ margin: 0, fontSize: ".88rem" }}>
          {service.description}
        </p>
      ) : null}
      <div className="service-card__meta">
        <span className="chip">Scheduled service</span>
        {service.durationMinutes ? (
          <span className="chip">
            {formatServiceDuration(service.durationMinutes)}
          </span>
        ) : null}
        {service.requiresSchedule ? (
          <span className="chip chip--primary">Time window required</span>
        ) : null}
      </div>
      <div className="service-card__foot">
        <span className="chip">Custom quote required</span>
        <ServiceQuoteButton service={service} className="btn btn--sm" />
      </div>
    </article>
  );
}
