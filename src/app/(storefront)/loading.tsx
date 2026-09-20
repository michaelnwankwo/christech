import { BrandLoader } from "@/components/ui/BrandLoader";

// src/app/(storefront)/loading.tsx — fires on every storefront navigation
// (category switches, pagination, filter Apply) while the server renders the
// next RSC payload. Kept deliberately light: the overlay itself carries the
// backdrop so the previous page stays dimly visible underneath — no blanking.
// No explicit label: BrandLoader's minimal "Loading…" is the intended copy
// (brand name removed from loading screens by design — the mark speaks).
export default function StorefrontLoading() {
  return <BrandLoader variant="full" />;
}
