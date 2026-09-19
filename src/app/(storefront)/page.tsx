import Link from "next/link";
import Image from "next/image";
import { ProductGrid } from "@/components/products/ProductGrid";
import { listProductCards } from "@/lib/catalog/queries";

export const dynamic = "force-dynamic"; // catalog reflects live inventory

// Home: hero + featured products. Server Components own catalog reads.
export default async function StorefrontHome() {
  const featured = await listProductCards({ page: 1 }).catch(() => null);

  return (
    <>
      <section className="hero surface-card">
        <div className="hero__copy">
          <h1>Security &amp; networking hardware, installed right.</h1>
          <p>
            Hikvision, Dahua, Cisco, MikroTik, Ubiquiti, Dintek, and Cambium
            equipment for homes, SMEs, and ISPs across Nigeria — with optional
            commissioning add-ons at checkout and full installation services
            you can book separately.
          </p>
          <div className="row">
            <Link href="/products" className="btn">
              Shop the catalog
            </Link>
            <Link href="/services" className="btn btn--secondary">
              Book an engineer
            </Link>
          </div>
        </div>
        <div style={{ flex: "0 1 340px" }}>
          <Image
            src="/brand/chrisviscus-logo.png"
            alt="Chrisviscus Technologies"
            width={344}
            height={110}
            priority
            unoptimized
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>
      </section>

      <ProductGrid cards={featured?.cards ?? []} />
    </>
  );
}
