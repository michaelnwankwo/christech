import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingService } from "@/lib/catalog/queries";
import { formatServiceDuration } from "@/types/services";
import { ServiceQuoteButton } from "@/components/services/ServiceQuoteButton";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = await getBookingService(slug).catch(() => null);
  if (!service) notFound();

  return (
    <article className="surface-card" style={{ padding: "1.4rem", maxWidth: 760 }}>
      <p style={{ margin: 0 }}>
        <Link href="/services" className="muted">
          ← All services
        </Link>
      </p>
      <h1 className="page-title">{service.name}</h1>
      {service.description ? <p>{service.description}</p> : null}

      <div className="row" style={{ gap: ".5rem" }}>
        <span className="chip chip--primary">Custom quote required</span>
        {service.durationMinutes ? (
          <span className="chip">
            {formatServiceDuration(service.durationMinutes)}
          </span>
        ) : null}
        {service.requiresSchedule ? (
          <span className="chip">Pick a requested window</span>
        ) : null}
      </div>

      <p className="muted" style={{ fontSize: ".85rem" }}>
        Every site is different: pricing is quoted by staff after review —
        no payment is taken at request time. Send your site details straight
        to our WhatsApp line and an engineer replies with your custom quote.
      </p>

      <ServiceQuoteButton service={service} />
    </article>
  );
}
