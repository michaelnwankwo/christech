import { listBookingServices } from "@/lib/catalog/queries";
import { BookingWizard } from "@/components/services/BookingWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request a service booking" };

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const services = await listBookingServices().catch(() => []);

  return (
    <BookingWizard
      services={services}
      initialServiceSlug={service?.trim() || undefined}
    />
  );
}
