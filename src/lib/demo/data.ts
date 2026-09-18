// src/lib/demo/data.ts
// Static mock dataset — mirrors supabase/migrations/0007_realtime_seed.sql
// EXACTLY (same SKUs, names, prices in NGN minor units, zones, rate card),
// so the offline UI exercises the real catalog, not toy numbers.
//
// This module is dependency-free and safe on both server and client.
// It contains NO secrets and NO real order data.

import type { Currency, ProductBrand } from "@/types/catalog";
import type { OrderStatus } from "@/types/checkout";

export type DemoProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  brand: ProductBrand;
  category: string;
  usageTags: string[];
  unitPriceMinor: number;
  inventoryQty: number;
  shippingClass: "standard" | "bulky";
  imageUrls: string[];
  isActive: true;
};

export type DemoService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "booking" | "add_on";
  basePriceMinor: number;
  durationMinutes: number | null;
  requiresSchedule: boolean;
};

/** uuid-shaped ids: pages like /account/orders/[id] validate the uuid format. */
const pid = (n: number) =>
  `de400000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: pid(1), sku: "HK-IPC-T124", slug: "hikvision-acuSense-t124-4mp-dome",
    name: "Hikvision DS-2CD2143G2-IU AcuSense 4MP Dome",
    description:
      "Vandal-resistant 4MP dome with AcuSense human/vehicle filtering, built-in mic, and IR to 30 m. PoE.",
    brand: "Hikvision", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "smb"],
    unitPriceMinor: 18_500_000, inventoryQty: 42,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(2), sku: "HK-NVR-7632", slug: "hikvision-7632n-i3s8-32ch-nvr",
    name: "Hikvision DS-7632NI-I3/8S 32-Channel NVR",
    description:
      "32-channel, 8 SATA bays, 400 Mbps incoming, AcuSense-linked analytics, HDMI+VGA out.",
    brand: "Hikvision", category: "recorders",
    usageTags: ["cctv", "enterprise", "storage"],
    unitPriceMinor: 74_500_000, inventoryQty: 9,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(3), sku: "DH-IPC-HFW3549", slug: "dahua-wizmind-5mp-bullet",
    name: "Dahua IPC-HFW3549T1S-AS-PV WizSense 5MP Bullet",
    description:
      "5MP bullet with audio+light deterrence, starlight sensor, IP67. Ideal for perimeter lines.",
    brand: "Dahua", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "smb"],
    unitPriceMinor: 16_200_000, inventoryQty: 35,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(4), sku: "CC-C9200-48P", slug: "cisco-catalyst-9200-48p-4x",
    name: "Cisco Catalyst C9200-48P-4X 48-Port PoE+ Switch",
    description:
      "Layer 2/3 access switch, 4x10G uplinks, Network Essentials. The backbone for multi-VLAN CCTV fabrics.",
    brand: "Cisco", category: "networking",
    usageTags: ["enterprise", "poe", "core"],
    unitPriceMinor: 395_000_000, inventoryQty: 4,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(5), sku: "MK-CCR2004", slug: "mikrotik-ccr2004g-2s-20t",
    name: "MikroTik CCR2004-2S-20T Cloud Core Router",
    description:
      "20-core routing platform with 2x SFP+ and 20x 10G RJ45. Built for ISP and campus edge BGP.",
    brand: "MikroTik", category: "networking",
    usageTags: ["isp", "enterprise", "wireless-backhaul"],
    unitPriceMinor: 69_000_000, inventoryQty: 12,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(6), sku: "UB-U6-LR", slug: "ubiquiti-u6-long-range-ap",
    name: "Ubiquiti UniFi U6 Long-Range Access Point",
    description:
      "Wi-Fi 6, 5.1 Gbps aggregate, powered coverage across courtyards and warehouse floors. UniFi managed.",
    brand: "Ubiquiti", category: "wireless",
    usageTags: ["isp", "smb", "wifi"],
    unitPriceMinor: 24_500_000, inventoryQty: 58,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(7), sku: "UB-ROCK-5X", slug: "ubiquiti-dream-machine-roller",
    name: "Ubiquiti UniFi Dream Machine Pro Max (UDM-Pro-Max)",
    description:
      "Security gateway + controller with 10G SFP+ WAN/LAN, deep packet inspection at multi-gigabit.",
    brand: "Ubiquiti", category: "networking",
    usageTags: ["smb", "wifi", "core"],
    unitPriceMinor: 58_500_000, inventoryQty: 17,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(8), sku: "DT-ONV-24P", slug: "dintek-onvif-24p-managed-switch",
    name: "Dintek 24-Port ONVIF Managed PoE Switch",
    description:
      "Budget CCTV-class managed switch with ONVIF profile support and PoE budgets tuned for NVR uplinks.",
    brand: "Dintek", category: "networking",
    usageTags: ["cctv", "poe", "smb"],
    unitPriceMinor: 12_800_000, inventoryQty: 26,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(9), sku: "CM-PTMP-600", slug: "cambium-cnmae-pmp-600",
    name: "Cambium Networks PMP 450m 600 Mbps Sector Antenna",
    description: "Licensed-band fixed-wireless access sector for last-mile ISP distribution.",
    brand: "Cambium", category: "wireless",
    usageTags: ["isp", "wireless-backhaul", "outdoor"],
    unitPriceMinor: 93_000_000, inventoryQty: 6,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(10), sku: "HK-DS-1280", slug: "hikvision-wall-mount-bracket",
    name: "Hikvision DS-1280ZJ-S36 Wall Bracket (Steel)",
    description:
      "Heavy-duty steel junction bracket for dome installs. Ships flat, cuts install time on ramped jobs.",
    brand: "Hikvision", category: "accessories",
    usageTags: ["cctv", "smb"],
    unitPriceMinor: 950_000, inventoryQty: 240,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
];

export const DEMO_SERVICES: DemoService[] = [
  {
    id: pid(21), slug: "addon-cctv-commissioning",
    name: "CCTV Commissioning & Network Tuning",
    description:
      "Certified engineer configures cameras, NVR retention, VLANs, and remote viewing at delivery.",
    kind: "add_on", basePriceMinor: 4_500_000, durationMinutes: 120,
    requiresSchedule: false,
  },
  {
    id: pid(22), slug: "addon-firmware-hardening",
    name: "Firmware & Security Hardening",
    description:
      "Firmware baseline, credential hygiene, port lockdown, and update policy for switches and APs.",
    kind: "add_on", basePriceMinor: 3_000_000, durationMinutes: 60,
    requiresSchedule: false,
  },
  {
    id: pid(23), slug: "addon-extended-warranty-24m",
    name: "Extended Warranty — 24 Months",
    description: "Chrisviscus-backed advance-swap warranty on top of the manufacturer warranty.",
    kind: "add_on", basePriceMinor: 6_000_000, durationMinutes: null,
    requiresSchedule: false,
  },
  {
    id: pid(24), slug: "install-full-cctv-site",
    name: "Full CCTV Site Installation",
    description:
      "End-to-end installation for homes and SME sites: cabling, mounting, NVR setup, handover docs.",
    kind: "booking", basePriceMinor: 25_000_000, durationMinutes: 480,
    requiresSchedule: true,
  },
  {
    id: pid(25), slug: "network-audit-remediation",
    name: "Network Audit & Remediation",
    description:
      "Structured audit of switching, routing, Wi-Fi coverage, and CCTV fabric with a written fix plan.",
    kind: "booking", basePriceMinor: 18_000_000, durationMinutes: 240,
    requiresSchedule: true,
  },
  {
    id: pid(26), slug: "isp-link-installation",
    name: "ISP Link Installation & Alignment",
    description: "Sector/panel mounting, alignment, PoE injection, and signal benchmarking for WISP links.",
    kind: "booking", basePriceMinor: 21_000_000, durationMinutes: 360,
    requiresSchedule: true,
  },
  {
    id: pid(27), slug: "support-monthly-maintenance",
    name: "Monthly Maintenance Retainer",
    description:
      "Scheduled preventive maintenance: inspections, firmware windows, cleaning, uptime reporting.",
    kind: "booking", basePriceMinor: 15_000_000, durationMinutes: 180,
    requiresSchedule: true,
  },
];

/** Mirror of the seeded shipping_rate_cards, keyed `${zone}:${class}`. */
export const DEMO_SHIPPING_MINOR: Record<string, number> = {
  "lagos-mainland:standard": 350_000,
  "lagos-mainland:bulky": 1_200_000,
  "lagos-island:standard": 450_000,
  "lagos-island:bulky": 1_500_000,
  "abuja:standard": 600_000,
  "abuja:bulky": 2_000_000,
  "south-west:standard": 700_000,
  "south-west:bulky": 2_200_000,
  "south-east:standard": 900_000,
  "south-east:bulky": 2_800_000,
  "south-south:standard": 950_000,
  "south-south:bulky": 2_900_000,
  "north:standard": 1_100_000,
  "north:bulky": 3_200_000,
  "ng-other:standard": 1_000_000,
  "ng-other:bulky": 3_000_000,
  "intl:standard": 7_500_000,
  "intl:bulky": 15_000_000,
};

/**
 * DB labels (as returned by zoneLabelForPreview, which title-cases the
 * hyphenated zone names: "south-south" → "South-South") → rate-card codes.
 */
export const DEMO_ZONE_BY_LABEL: Record<string, string> = {
  "Lagos Island": "lagos-island",
  "Lagos Mainland": "lagos-mainland",
  "Abuja / FCT": "abuja",
  "South-West": "south-west",
  "South-East": "south-east",
  "South-South": "south-south",
  "Northern Nigeria": "north",
  "Nigeria (other)": "ng-other",
  international: "intl",
};

/* ── Account-domain mocks ──────────────────────────────────────────────── */

export const DEMO_USER = {
  id: "de400000-0000-4000-8000-0000000000c0",
  email: "demo-shopper@chrisviscus.test",
  full_name: "Demo Shopper",
  role: "customer" as const,
};

export const DEMO_ORDERS = [
  {
    id: "de400001-0000-4000-8000-000000000001",
    order_number: "ORD-DEMO-0001",
    status: "delivered" as OrderStatus,
    payment_status: "paid",
    display_currency: "NGN" as Currency,
    charge_currency: "NGN" as Currency,
    shipping_zone: "lagos-mainland",
    subtotal_display_minor: 22_850_000,
    shipping_display_minor: 1_200_000,
    total_display_minor: 24_050_000,
    created_at: "2026-09-10T09:12:00.000Z",
    items: [
      { name: "Hikvision DS-2CD2143G2-IU AcuSense 4MP Dome", qty: 1, unit: 18_500_000 },
      { name: "CCTV Commissioning & Network Tuning", qty: 1, unit: 4_500_000 },
    ],
    events: [
      { id: "ev1", event_type: "payment_paid", from_status: "pending_payment", to_status: "paid", created_at: "2026-09-10T09:20:00.000Z" },
      { id: "ev2", event_type: "fulfilment_started", from_status: "paid", to_status: "processing", created_at: "2026-09-11T08:00:00.000Z" },
      { id: "ev3", event_type: "delivered", from_status: "shipped", to_status: "delivered", created_at: "2026-09-12T15:30:00.000Z" },
    ],
  },
  {
    id: "de400002-0000-4000-8000-000000000002",
    order_number: "ORD-DEMO-0002",
    status: "pending_payment" as OrderStatus,
    payment_status: "pending",
    display_currency: "USD" as Currency,
    charge_currency: "USD" as Currency,
    shipping_zone: "abuja",
    subtotal_display_minor: 1_456_000,
    shipping_display_minor: 45_500,
    total_display_minor: 1_501_500,
    created_at: "2026-09-17T18:45:00.000Z",
    items: [
      { name: "Ubiquiti UniFi U6 Long-Range Access Point", qty: 2, unit: 159_250 },
      { name: "Hikvision DS-1280ZJ-S36 Wall Bracket (Steel)", qty: 30, unit: 6_175 },
    ],
    events: [
      { id: "ev4", event_type: "created", from_status: null, to_status: "pending_payment", created_at: "2026-09-17T18:45:00.000Z" },
    ],
  },
];

export const DEMO_SERVICE_REQUESTS = [
  {
    id: "de400003-0000-4000-8000-000000000001",
    request_number: "SRV-DEMO-0001",
    service_name: "Full CCTV Site Installation",
    status: "confirmed",
    window: "2026-09-28 09:00 → 17:00",
    site: "12 Adeniyi Jones Ave, Ikeja, Lagos",
  },
];

/** Built-in last-resort FX (same numbers as the documented MANUAL_FX_RATES
 * example) so demo quotes compute offline with zero network at all. */
export const DEMO_FX_RATES = {
  NGN: 1,
  USD: 0.00065,
  GBP: 0.00051,
  EUR: 0.0006,
} as const;

export const DEMO_NOTE =
  "Demo data — database not connected. Prices are real catalog values but orders are NOT persisted and payments are disabled.";

export { pid as demoId };
