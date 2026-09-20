import Link from "next/link";
import type { ServiceVM } from "@/types/catalog";
import { formatMinorMoney } from "@/lib/currency/money";
import { BookingCtaButton } from "./BookingCtaButton";

// src/components/services/ServiceCard.tsx
// §11.3: duration + scheduling requirements are shown; status is never
// represented as payment status; there is no "add to cart" anywhere here.

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
          <span className="chip">~{formatDuration(service.durationMinutes)}</span>
        ) : null}
        {service.requiresSchedule ? (
          <span className="chip chip--primary">Time window required</span>
        ) : null}
      </div>
      <div className="service-card__foot">
        <strong className="mono">
          From {formatMinorMoney(service.basePriceMinor, "NGN")}
        </strong>
        <BookingCtaButton slug={service.slug} />
      </div>
    </article>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
