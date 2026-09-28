-- ============================================================================
-- 0010_catalog_expansion.sql
-- Adds 20 active, in-stock products (10 existing + 20 = 30 total).
--
-- Money contract: unit_price_minor is NGN kobo (₦1 = 100 minor units).
-- Stock contract: inventory_qty > 0 drives the generated products.in_stock
-- column added by 0008. metadata.stock_status is included for bulk-export
-- consumers that require the human-readable value "In stock".
--
-- Idempotency: rerunning updates the curated catalog rows by SKU.
-- Pricing is a 2026-09-28 Nigerian retail snapshot and should be reviewed
-- periodically for FX/import changes. Research notes: docs/CATALOG_EXPANSION.md.
-- ============================================================================

insert into public.products
  (sku, slug, name, description, brand, category, usage_tags,
   unit_price_minor, inventory_qty, shipping_class, image_urls, metadata,
   is_active)
values
  ('HK-IPC-B2043', 'hikvision-ds-2cd2043g2-iu-4mp-bullet',
   'Hikvision DS-2CD2043G2-IU AcuSense 4MP Bullet',
   '4MP IP67 PoE bullet camera with human and vehicle classification, built-in microphone, H.265+ and 40 m infrared illumination.',
   'Hikvision', 'cameras', array['cctv','outdoor','poe','acusense','smb'],
   19500000, 28, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('HK-IPC-CV4MP', 'hikvision-ds-2cd2347g2-lu-colorvu-turret',
   'Hikvision DS-2CD2347G2-LU ColorVu 4MP Turret',
   'ColorVu 4MP fixed-lens turret with 24/7 full-colour imaging, white-light supplement, microphone, AcuSense analytics and PoE.',
   'Hikvision', 'cameras', array['cctv','outdoor','poe','colorvu','low-light'],
   23500000, 22, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('HK-NVR-7608-8P', 'hikvision-ds-7608ni-k2-8p-8-channel-nvr',
   'Hikvision DS-7608NI-K2/8P 8-Channel PoE NVR',
   'Eight-channel 4K network recorder with eight integrated PoE ports, dual SATA bays and H.265+ recording for small surveillance sites.',
   'Hikvision', 'recorders', array['cctv','poe','storage','smb'],
   42000000, 12, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DH-IPC-HDW2449', 'dahua-ipc-hdw2449t-s-pro-4mp-turret',
   'Dahua IPC-HDW2449T-S-PRO 4MP WizColor Turret',
   '4MP PoE turret camera with WizColor low-light imaging, smart dual illumination, H.265 and IP67 weather protection.',
   'Dahua', 'cameras', array['cctv','outdoor','poe','wizcolor','low-light'],
   15500000, 31, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DH-IPC-HFW3849', 'dahua-ipc-hfw3849t1-as-pv-8mp-bullet',
   'Dahua IPC-HFW3849T1-AS-PV 8MP TiOC Bullet',
   '8MP active-deterrence bullet with red/blue warning lights, two-way audio, AI human and vehicle detection, PoE and IP67 housing.',
   'Dahua', 'cameras', array['cctv','outdoor','poe','active-deterrence','enterprise'],
   28500000, 18, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DH-NVR-4216-16P', 'dahua-nvr4216-16p-4ks2-i-16-channel',
   'Dahua NVR4216-16P-4KS2/I 16-Channel PoE NVR',
   'Sixteen-channel 4K NVR with 16 PoE ports, two SATA bays, AI-by-recorder functions and H.265+ decoding.',
   'Dahua', 'recorders', array['cctv','poe','storage','enterprise'],
   62500000, 9, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('CC-CBS350-24P', 'cisco-cbs350-24p-4g-managed-poe-switch',
   'Cisco Business CBS350-24P-4G 24-Port PoE Managed Switch',
   'Managed 24-port Gigabit PoE switch with four SFP uplinks, VLAN, static routing and enterprise access-layer controls.',
   'Cisco', 'networking', array['enterprise','poe','managed','core'],
   145000000, 7, 'bulky', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('CC-CBS250-8PP', 'cisco-cbs250-8pp-e-2g-smart-poe-switch',
   'Cisco Business CBS250-8PP-E-2G 8-Port PoE+ Smart Switch',
   'Compact smart-managed switch with eight Gigabit PoE+ ports and two Gigabit combo uplinks for branch CCTV and Wi-Fi deployments.',
   'Cisco', 'networking', array['smb','poe','managed','cctv'],
   42000000, 14, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('MK-RB5009', 'mikrotik-rb5009ug-s-in-router',
   'MikroTik RB5009UG+S+IN Router',
   'Quad-core ARM64 router with seven Gigabit ports, one 2.5GbE port, one 10G SFP+ cage, USB 3.0 and RouterOS v7.',
   'MikroTik', 'networking', array['isp','enterprise','routing','10gbe'],
   32500000, 16, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('MK-CRS326-24G', 'mikrotik-crs326-24g-2s-rm-switch',
   'MikroTik CRS326-24G-2S+RM Cloud Router Switch',
   'Rackmount managed switch with 24 Gigabit Ethernet ports, two 10G SFP+ cages and dual-boot RouterOS or SwOS.',
   'MikroTik', 'networking', array['isp','enterprise','managed','10gbe'],
   33500000, 11, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('MK-E60IGS', 'mikrotik-hex-s-2025-e60igs-router',
   'MikroTik hEX S (2025) E60iGS Router',
   'Compact wired router with five Gigabit Ethernet ports, a 2.5G SFP cage, PoE output, USB and IPsec acceleration.',
   'MikroTik', 'networking', array['smb','routing','fiber','poe'],
   12500000, 25, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('UB-U7-PRO', 'ubiquiti-unifi-u7-pro-wifi-7-access-point',
   'Ubiquiti UniFi U7 Pro WiFi 7 Access Point',
   'Ceiling-mount tri-band Wi-Fi 7 access point with 6 GHz support, 2.5GbE uplink and PoE+ power for high-density offices.',
   'Ubiquiti', 'wireless', array['enterprise','wifi','wifi-7','poe'],
   34000000, 20, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('UB-USW-PRO-24P', 'ubiquiti-usw-pro-24-poe-switch',
   'Ubiquiti UniFi Switch Pro 24 PoE (USW-Pro-24-PoE)',
   'Layer-3 UniFi switch with 24 PoE-capable Gigabit ports, two 10G SFP+ uplinks and a 400 W PoE budget.',
   'Ubiquiti', 'networking', array['enterprise','poe','managed','10gbe'],
   155000000, 6, 'bulky', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('UB-NS-5ACL', 'ubiquiti-nanostation-5ac-loco',
   'Ubiquiti NanoStation 5AC loco (Loco5AC)',
   'Compact 5 GHz airMAX CPE with integrated directional antenna for point-to-point links and last-mile subscriber connections.',
   'Ubiquiti', 'wireless', array['isp','wireless-backhaul','outdoor','cpe'],
   16500000, 24, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DT-C6-305-GR', 'dintek-powermax-cat6-utp-cable-305m',
   'Dintek PowerMAX Cat.6 UTP Cable 305 m',
   '305-metre box of 23 AWG solid-copper, four-pair Cat.6 UTP installation cable for structured cabling, CCTV and data networks.',
   'Dintek', 'accessories', array['structured-cabling','cat6','cctv','enterprise'],
   3430000, 40, 'bulky', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DT-PP24-C6', 'dintek-powermax-cat6-24-port-patch-panel',
   'Dintek PowerMAX Cat.6 24-Port Patch Panel',
   'Rackmount 1U 24-port Cat.6 patch panel with labelled IDC termination for standards-based structured cabling installations.',
   'Dintek', 'accessories', array['structured-cabling','cat6','rack','enterprise'],
   8900000, 19, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('CM-F300-25L', 'cambium-epmp-force-300-25l-subscriber-module',
   'Cambium ePMP Force 300-25L 5 GHz Subscriber Module',
   'Outdoor 802.11ac Wave 2 radio with integrated 25 dBi dish, up to 400 Mbps capacity and ePMP point-to-multipoint support.',
   'Cambium', 'wireless', array['isp','wireless-backhaul','outdoor','cpe'],
   31153600, 13, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('CM-XV2-2T0', 'cambium-xv2-2t0-outdoor-wifi-6-ap',
   'Cambium XV2-2T0 Outdoor Wi-Fi 6 Access Point',
   'Rugged dual-radio Wi-Fi 6 outdoor access point with cloud management, sector coverage and PoE power for campuses and hospitality.',
   'Cambium', 'wireless', array['enterprise','wifi','wifi-6','outdoor','poe'],
   51500000, 8, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('HK-DS-1273ZJ', 'hikvision-ds-1273zj-140-wall-mount-bracket',
   'Hikvision DS-1273ZJ-140 Wall Mount Bracket',
   'Aluminium wall-mount bracket for compatible Hikvision dome and turret cameras, with internal cable routing for protected installations.',
   'Hikvision', 'accessories', array['cctv','mounting','outdoor'],
   3200000, 55, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true),
  ('DH-NVR-4108-8P', 'dahua-nvr4108-8p-4ks2-l-8-channel',
   'Dahua NVR4108-8P-4KS2/L 8-Channel PoE NVR',
   'Compact eight-channel 4K network recorder with eight built-in PoE ports, one SATA bay and H.265+ video compression.',
   'Dahua', 'recorders', array['cctv','poe','storage','smb'],
   41000000, 15, 'standard', '{}', '{"stock_status":"In stock"}'::jsonb, true)
on conflict (sku) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  brand = excluded.brand,
  category = excluded.category,
  usage_tags = excluded.usage_tags,
  unit_price_minor = excluded.unit_price_minor,
  inventory_qty = excluded.inventory_qty,
  shipping_class = excluded.shipping_class,
  metadata = public.products.metadata || excluded.metadata,
  is_active = excluded.is_active,
  updated_at = now();

-- Deployment assertion: fails loudly if this project still has fewer than 30
-- active products after the migration.
do $$
begin
  if (select count(*) from public.products where is_active) < 30 then
    raise exception 'Catalog expansion failed: expected at least 30 active products';
  end if;
end $$;
