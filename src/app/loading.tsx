import { BrandLoader } from "@/components/ui/BrandLoader";

// src/app/loading.tsx — root-level route boundary (login/signup/account and
// any segment without its own loading.tsx): one branded overlay instead of
// the browser's naked white flash between server renders.
export default function RootLoading() {
  return <BrandLoader variant="full" label="Loading…" />;
}
