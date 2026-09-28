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

  {
    id: pid(11), sku: "HK-IPC-B2043", slug: "hikvision-ds-2cd2043g2-iu-4mp-bullet",
    name: "Hikvision DS-2CD2043G2-IU AcuSense 4MP Bullet",
    description: "4MP IP67 PoE bullet camera with human and vehicle classification, built-in microphone, H.265+ and 40 m infrared illumination.",
    brand: "Hikvision", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "acusense", "smb"],
    unitPriceMinor: 19_500_000, inventoryQty: 28,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(12), sku: "HK-IPC-CV4MP", slug: "hikvision-ds-2cd2347g2-lu-colorvu-turret",
    name: "Hikvision DS-2CD2347G2-LU ColorVu 4MP Turret",
    description: "ColorVu 4MP fixed-lens turret with 24/7 full-colour imaging, white-light supplement, microphone, AcuSense analytics and PoE.",
    brand: "Hikvision", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "colorvu", "low-light"],
    unitPriceMinor: 23_500_000, inventoryQty: 22,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(13), sku: "HK-NVR-7608-8P", slug: "hikvision-ds-7608ni-k2-8p-8-channel-nvr",
    name: "Hikvision DS-7608NI-K2/8P 8-Channel PoE NVR",
    description: "Eight-channel 4K network recorder with eight integrated PoE ports, dual SATA bays and H.265+ recording for small surveillance sites.",
    brand: "Hikvision", category: "recorders",
    usageTags: ["cctv", "poe", "storage", "smb"],
    unitPriceMinor: 42_000_000, inventoryQty: 12,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(14), sku: "DH-IPC-HDW2449", slug: "dahua-ipc-hdw2449t-s-pro-4mp-turret",
    name: "Dahua IPC-HDW2449T-S-PRO 4MP WizColor Turret",
    description: "4MP PoE turret camera with WizColor low-light imaging, smart dual illumination, H.265 and IP67 weather protection.",
    brand: "Dahua", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "wizcolor", "low-light"],
    unitPriceMinor: 15_500_000, inventoryQty: 31,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(15), sku: "DH-IPC-HFW3849", slug: "dahua-ipc-hfw3849t1-as-pv-8mp-bullet",
    name: "Dahua IPC-HFW3849T1-AS-PV 8MP TiOC Bullet",
    description: "8MP active-deterrence bullet with red/blue warning lights, two-way audio, AI human and vehicle detection, PoE and IP67 housing.",
    brand: "Dahua", category: "cameras",
    usageTags: ["cctv", "outdoor", "poe", "active-deterrence", "enterprise"],
    unitPriceMinor: 28_500_000, inventoryQty: 18,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(16), sku: "DH-NVR-4216-16P", slug: "dahua-nvr4216-16p-4ks2-i-16-channel",
    name: "Dahua NVR4216-16P-4KS2/I 16-Channel PoE NVR",
    description: "Sixteen-channel 4K NVR with 16 PoE ports, two SATA bays, AI-by-recorder functions and H.265+ decoding.",
    brand: "Dahua", category: "recorders",
    usageTags: ["cctv", "poe", "storage", "enterprise"],
    unitPriceMinor: 62_500_000, inventoryQty: 9,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(17), sku: "CC-CBS350-24P", slug: "cisco-cbs350-24p-4g-managed-poe-switch",
    name: "Cisco Business CBS350-24P-4G 24-Port PoE Managed Switch",
    description: "Managed 24-port Gigabit PoE switch with four SFP uplinks, VLAN, static routing and enterprise access-layer controls.",
    brand: "Cisco", category: "networking",
    usageTags: ["enterprise", "poe", "managed", "core"],
    unitPriceMinor: 145_000_000, inventoryQty: 7,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(18), sku: "CC-CBS250-8PP", slug: "cisco-cbs250-8pp-e-2g-smart-poe-switch",
    name: "Cisco Business CBS250-8PP-E-2G 8-Port PoE+ Smart Switch",
    description: "Compact smart-managed switch with eight Gigabit PoE+ ports and two Gigabit combo uplinks for branch CCTV and Wi-Fi deployments.",
    brand: "Cisco", category: "networking",
    usageTags: ["smb", "poe", "managed", "cctv"],
    unitPriceMinor: 42_000_000, inventoryQty: 14,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(19), sku: "MK-RB5009", slug: "mikrotik-rb5009ug-s-in-router",
    name: "MikroTik RB5009UG+S+IN Router",
    description: "Quad-core ARM64 router with seven Gigabit ports, one 2.5GbE port, one 10G SFP+ cage, USB 3.0 and RouterOS v7.",
    brand: "MikroTik", category: "networking",
    usageTags: ["isp", "enterprise", "routing", "10gbe"],
    unitPriceMinor: 32_500_000, inventoryQty: 16,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(20), sku: "MK-CRS326-24G", slug: "mikrotik-crs326-24g-2s-rm-switch",
    name: "MikroTik CRS326-24G-2S+RM Cloud Router Switch",
    description: "Rackmount managed switch with 24 Gigabit Ethernet ports, two 10G SFP+ cages and dual-boot RouterOS or SwOS.",
    brand: "MikroTik", category: "networking",
    usageTags: ["isp", "enterprise", "managed", "10gbe"],
    unitPriceMinor: 33_500_000, inventoryQty: 11,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(21), sku: "MK-E60IGS", slug: "mikrotik-hex-s-2025-e60igs-router",
    name: "MikroTik hEX S (2025) E60iGS Router",
    description: "Compact wired router with five Gigabit Ethernet ports, a 2.5G SFP cage, PoE output, USB and IPsec acceleration.",
    brand: "MikroTik", category: "networking",
    usageTags: ["smb", "routing", "fiber", "poe"],
    unitPriceMinor: 12_500_000, inventoryQty: 25,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(22), sku: "UB-U7-PRO", slug: "ubiquiti-unifi-u7-pro-wifi-7-access-point",
    name: "Ubiquiti UniFi U7 Pro WiFi 7 Access Point",
    description: "Ceiling-mount tri-band Wi-Fi 7 access point with 6 GHz support, 2.5GbE uplink and PoE+ power for high-density offices.",
    brand: "Ubiquiti", category: "wireless",
    usageTags: ["enterprise", "wifi", "wifi-7", "poe"],
    unitPriceMinor: 34_000_000, inventoryQty: 20,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(23), sku: "UB-USW-PRO-24P", slug: "ubiquiti-usw-pro-24-poe-switch",
    name: "Ubiquiti UniFi Switch Pro 24 PoE (USW-Pro-24-PoE)",
    description: "Layer-3 UniFi switch with 24 PoE-capable Gigabit ports, two 10G SFP+ uplinks and a 400 W PoE budget.",
    brand: "Ubiquiti", category: "networking",
    usageTags: ["enterprise", "poe", "managed", "10gbe"],
    unitPriceMinor: 155_000_000, inventoryQty: 6,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(24), sku: "UB-NS-5ACL", slug: "ubiquiti-nanostation-5ac-loco",
    name: "Ubiquiti NanoStation 5AC loco (Loco5AC)",
    description: "Compact 5 GHz airMAX CPE with integrated directional antenna for point-to-point links and last-mile subscriber connections.",
    brand: "Ubiquiti", category: "wireless",
    usageTags: ["isp", "wireless-backhaul", "outdoor", "cpe"],
    unitPriceMinor: 16_500_000, inventoryQty: 24,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(25), sku: "DT-C6-305-GR", slug: "dintek-powermax-cat6-utp-cable-305m",
    name: "Dintek PowerMAX Cat.6 UTP Cable 305 m",
    description: "305-metre box of 23 AWG solid-copper, four-pair Cat.6 UTP installation cable for structured cabling, CCTV and data networks.",
    brand: "Dintek", category: "accessories",
    usageTags: ["structured-cabling", "cat6", "cctv", "enterprise"],
    unitPriceMinor: 3_430_000, inventoryQty: 40,
    shippingClass: "bulky", imageUrls: [], isActive: true,
  },
  {
    id: pid(26), sku: "DT-PP24-C6", slug: "dintek-powermax-cat6-24-port-patch-panel",
    name: "Dintek PowerMAX Cat.6 24-Port Patch Panel",
    description: "Rackmount 1U 24-port Cat.6 patch panel with labelled IDC termination for standards-based structured cabling installations.",
    brand: "Dintek", category: "accessories",
    usageTags: ["structured-cabling", "cat6", "rack", "enterprise"],
    unitPriceMinor: 8_900_000, inventoryQty: 19,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(27), sku: "CM-F300-25L", slug: "cambium-epmp-force-300-25l-subscriber-module",
    name: "Cambium ePMP Force 300-25L 5 GHz Subscriber Module",
    description: "Outdoor 802.11ac Wave 2 radio with integrated 25 dBi dish, up to 400 Mbps capacity and ePMP point-to-multipoint support.",
    brand: "Cambium", category: "wireless",
    usageTags: ["isp", "wireless-backhaul", "outdoor", "cpe"],
    unitPriceMinor: 31_153_600, inventoryQty: 13,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(28), sku: "CM-XV2-2T0", slug: "cambium-xv2-2t0-outdoor-wifi-6-ap",
    name: "Cambium XV2-2T0 Outdoor Wi-Fi 6 Access Point",
    description: "Rugged dual-radio Wi-Fi 6 outdoor access point with cloud management, sector coverage and PoE power for campuses and hospitality.",
    brand: "Cambium", category: "wireless",
    usageTags: ["enterprise", "wifi", "wifi-6", "outdoor", "poe"],
    unitPriceMinor: 51_500_000, inventoryQty: 8,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(29), sku: "HK-DS-1273ZJ", slug: "hikvision-ds-1273zj-140-wall-mount-bracket",
    name: "Hikvision DS-1273ZJ-140 Wall Mount Bracket",
    description: "Aluminium wall-mount bracket for compatible Hikvision dome and turret cameras, with internal cable routing for protected installations.",
    brand: "Hikvision", category: "accessories",
    usageTags: ["cctv", "mounting", "outdoor"],
    unitPriceMinor: 3_200_000, inventoryQty: 55,
    shippingClass: "standard", imageUrls: [], isActive: true,
  },
  {
    id: pid(30), sku: "DH-NVR-4108-8P", slug: "dahua-nvr4108-8p-4ks2-l-8-channel",
    name: "Dahua NVR4108-8P-4KS2/L 8-Channel PoE NVR",
    description: "Compact eight-channel 4K network recorder with eight built-in PoE ports, one SATA bay and H.265+ video compression.",
    brand: "Dahua", category: "recorders",
    usageTags: ["cctv", "poe", "storage", "smb"],
    unitPriceMinor: 41_000_000, inventoryQty: 15,
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
