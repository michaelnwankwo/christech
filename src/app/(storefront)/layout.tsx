// src/app/(storefront)/layout.tsx
// §8.3: the STOREFRONT layout mounts the sidebar + cart drawer. The cart is
// reachable ONLY under this segment group.
import { AppShell } from "@/components/layout/AppShell";

// Sidebar filters + cart drawer are URL/client-state driven; the catalog and
// inventory are live. Prerendering these segments would serve stale money
// data, so the whole group is dynamic on every request.
export const dynamic = "force-dynamic";
import { ResponsiveSidebar } from "@/components/sidebar/ResponsiveSidebar";
import { CartDrawer } from "@/components/cart/CartDrawer";
import {
  listDistinctCategories,
  listDistinctUsageTags,
} from "@/lib/catalog/queries";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side catalog meta for the filter sidebar (query-cache owned, §7.1)
  const [categories, usageTags] = await Promise.all([
    listDistinctCategories().catch(() => []),
    listDistinctUsageTags().catch(() => []),
  ]);

  return (
    <AppShell mode="storefront">
      <div className="storefront-grid">
        <ResponsiveSidebar categories={categories} usageTags={usageTags} />
        <div className="page-main">{children}</div>
      </div>
      <CartDrawer />
    </AppShell>
  );
}
