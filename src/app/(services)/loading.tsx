import { BrandLoader } from "@/components/ui/BrandLoader";

// src/app/(services)/loading.tsx — the (services) route group (catalog
// listing, service detail, booking wizard) had NO boundary of its own, so
// its force-dynamic server renders left the previous page frozen until the
// new payload landed. Same branded full overlay the storefront uses.
export default function ServicesLoading() {
  return <BrandLoader variant="full" />;
}
