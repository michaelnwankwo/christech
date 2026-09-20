// src/app/layout.tsx — root layout: metadata, a11y skip-link, providers.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { databaseUnavailable } from "@/lib/demo/mode";

// THE mobile-critical export: without this, every phone browser renders the
// site at a ~980px virtual canvas and zooms out — "broken layout" no CSS
// could fix. device-width + initial-scale 1 unlocks all ≤768px media queries.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

// The per-request CSP nonce (src/middleware.ts) must match every inline
// flight <script> in the served HTML — so every page renders per request.
// Static prerendering would bake nonces out of existence (blank pages under
// script-src nonce CSP); all content is DB-backed and dynamic anyway.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // NEXT_PUBLIC_APP_URL makes canonical/share/OG metadata absolute. Locally
  // it is http://localhost:3000; on deployment set it to the public origin.
  // Falls back safely so a missing value never breaks a build.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "Chrisviscus Technologies — Security, Networking & Support",
    template: "%s | Chrisviscus Technologies",
  },
  description:
    "Enterprise CCTV, networking hardware, and scheduled installation & support services for Nigerian homes, SMEs, and ISPs.",
  // Favicon REVERTED to the pre-logo-update asset on request: the original
  // brand PNG, restored byte-for-byte from git history. The generated
  // favicon.ico/icon.png never existed before the logo update, so "original
  // version" means deleting them and pointing back here. (A literal
  // src/app/favicon.ico never existed in this repo — app-dir convention
  // files have no history entry; /brand/... is what metadata referenced.)
  icons: {
    icon: "/brand/chrisviscus-logo.png",
  },
  openGraph: {
    type: "website",
    siteName: "Chrisviscus Technologies",
    title: "Chrisviscus Technologies — Security, Networking & Support",
    description:
      "Enterprise CCTV, networking hardware, and scheduled installation & support services for Nigerian homes, SMEs, and ISPs.",
    images: [
      {
        url: "/logo.png",
        width: 1309,
        height: 800,
        alt: "Chrisviscus Technologies",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chrisviscus Technologies — Security, Networking & Support",
    description:
      "Enterprise CCTV, networking hardware, and scheduled installation & support services for Nigerian homes, SMEs, and ISPs.",
    images: ["/logo.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One cached probe per request decides the demo banner AND the client
  // session fallback (React cache ⇒ pages/API never re-probe).
  const demoMode = await databaseUnavailable();

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {demoMode ? <DemoBanner /> : null}
        <Providers demoMode={demoMode}>{children}</Providers>
      </body>
    </html>
  );
}
