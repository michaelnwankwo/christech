import { BrandLoader } from "@/components/ui/BrandLoader";

// src/app/(storefront)/loading.tsx — fires on every storefront navigation
// (category switches, pagination, filter Apply) while the server renders the
// next RSC payload. Kept deliberately light: the overlay itself carries the
// backdrop so the previous page stays dimly visible underneath — no blanking.
export default function StorefrontLoading() {
  return <BrandLoader variant="full" label="Loading Christech…" />;
}
