import Link from "next/link";
import type { ReactNode } from "react";
import type { ServiceVM } from "@/types/catalog";
import { formatCompactServiceDuration } from "@/types/services";
import { ServiceQuoteButton } from "./ServiceQuoteButton";

// src/components/services/ServiceCard.tsx
// §11.3: status is never represented as payment status; there is no
// "add to cart" anywhere here.
//
// CARD LAYOUT (quote-on-demand): the pill badges are GONE. Metadata now
// renders as a spec grid — DURATION / AVAILABILITY / PRICING — and the
// WhatsApp CTA spans the full card width. Pricing on cards is ALWAYS
// "Custom Quote Required"; baseline prices never appear here. The requested
// time window itself is collected inside the quote modal, so the old
// "Time window required" pill asked nothing the user had to decide here.

export function ServiceCard({ service }: { service: ServiceVM }) {
  const duration = formatCompactServiceDuration(service.durationMinutes);

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
      <dl className="service-card__specs">
        <ServiceSpec
          icon={<ClockIcon />}
          label="DURATION:"
          value={duration ? `approx. ${duration}` : "To be confirmed"}
        />
        <ServiceSpec
          icon={<CalendarIcon />}
          label="AVAILABILITY:"
          value="Custom Schedule"
        />
        <ServiceSpec
          icon={<CurrencyIcon />}
          label="PRICING:"
          value="Custom Quote Required"
        />
      </dl>
      <div className="service-card__foot">
        <ServiceQuoteButton
          service={service}
          className="btn btn--sm service-card__cta"
        />
      </div>
    </article>
  );
}

function ServiceSpec(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="service-spec">
      <dt className="service-spec__head">
        <span className="service-spec__icon" aria-hidden="true">
          {props.icon}
        </span>
        <span className="service-spec__label">{props.label}</span>
      </dt>
      <dd className="service-spec__value">{props.value}</dd>
    </div>
  );
}

// Lucide-equivalent inline icons (24×24 viewBox, stroke = currentColor —
// same geometry as lucide-react's Clock / Calendar / DollarSign). Three
// tiny glyphs do not justify a runtime dependency, and inline SVG keeps
// the card a zero-JS server component.
function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CurrencyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
