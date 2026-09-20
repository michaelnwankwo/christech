// src/components/layout/AppShell.tsx — blueprint §8.3 verbatim interface.
// Footer is copyright-only by explicit request: the Paystack badge and the
// display-currency chip left the bar (payments messaging lives at checkout,
// the live currency picker lives in the header).
// The storefront layout mounts sidebar + cart drawer inside this shell; the
// services layout mounts booking navigation INSTEAD and never mounts the
// cart drawer (§8.3 mandate).
import Image from "next/image";
import { SiteHeader } from "./SiteHeader";

export function AppShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "storefront" | "service-booking";
}) {
  return (
    <div className="app-shell">
      <SiteHeader mode={mode} />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Image
          src="/logo.png"
          alt="Chrisviscus Technologies"
          width={1309}
          height={800}
          unoptimized
          className="site-footer__logo"
        />
        <span>© {new Date().getFullYear()} Chrisviscus Technologies — Lagos, Nigeria</span>
      </div>
    </footer>
  );
}
