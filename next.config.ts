// next.config.ts — root middleware (src/lib/security/csp.ts). It must be
// computed per request with a fresh nonce so Next.js can attach it to its
// inline RSC "flight" <script> chunks; headers() here is static, which is
// exactly what previously blank-screened the app in the browser.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // CSP itself is NOT set here — see comment at top of file.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
