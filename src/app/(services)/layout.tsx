// src/app/(services)/layout.tsx
// §8.3: the SERVICES layout mounts booking-specific navigation and NEVER
// the cart drawer. Different shell, different stores, different tables.
import { AppShell } from "@/components/layout/AppShell";

// Sidebar filters + cart drawer are URL/client-state driven; the catalog and
// inventory are live. Prerendering these segments would serve stale money
// data, so the whole group is dynamic on every request.
export const dynamic = "force-dynamic";
import { ServiceNavigation } from "@/components/services/ServiceNavigation";

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell mode="service-booking">
      <div className="page-container">
        <ServiceNavigation />
        {children}
      </div>
    </AppShell>
  );
}
