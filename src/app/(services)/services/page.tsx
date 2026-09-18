import { listBookingServices } from "@/lib/catalog/queries";
import { ServiceCard } from "@/components/services/ServiceCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a service" };

// §11 discovery — only kind='booking' services (server query enforces it).
export default async function ServicesPage() {
  const services = await listBookingServices().catch(() => []);

  return (
    <>
      <section className="service-hero surface-card">
        <h1 className="page-title" style={{ margin: 0 }}>
          Installation, configuration, support &amp; maintenance
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
          Request a visit, choose a window, and describe the site. A
          Chrisviscus engineer reviews and confirms the schedule and final
          quote. Bookings are service requests — they never appear in your
          shopping cart, and store orders never create bookings.
        </p>
      </section>

      <div className="service-grid">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
        {services.length === 0 ? (
          <p className="muted">No bookable services are currently listed.</p>
        ) : null}
      </div>
    </>
  );
}
