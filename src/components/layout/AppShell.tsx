// src/components/layout/AppShell.tsx — blueprint §8.3 verbatim interface.
// The storefront layout mounts sidebar + cart drawer inside this shell; the
// services layout mounts booking navigation INSTEAD and never mounts the
// cart drawer (§8.3 mandate).
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
        <span>© {new Date().getFullYear()} Chrisviscus Technologies — Lagos, Nigeria</span>
        <span className="row">
          <span className="paystack-badge">Secured by Paystack</span>
          <span className="chip chip--accent">NGN · USD · GBP · EUR display</span>
        </span>
      </div>
    </footer>
  );
}
