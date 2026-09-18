import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingService } from "@/lib/catalog/queries";
import { formatMinorMoney } from "@/lib/currency/money";

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
        <span className="chip">
          Indicative from {formatMinorMoney(service.basePriceMinor, "NGN")}
        </span>
        {service.durationMinutes ? (
          <span className="chip">≈ {service.durationMinutes} minutes on site</span>
        ) : null}
        {service.requiresSchedule ? (
          <span className="chip chip--primary">Pick a requested window</span>
        ) : null}
      </div>

      <p className="muted" style={{ fontSize: ".85rem" }}>
        Final pricing is quoted by staff after review. No payment is taken at
        booking time.
      </p>

      <Link className="btn" href={`/booking?service=${service.slug}`}>
        Request this booking
      </Link>
    </article>
  );
}
