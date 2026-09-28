-- ============================================================================
-- Chrisviscus catalog seed: all 30 storefront products
--
-- Standalone, idempotent production seed for Supabase SQL Editor or psql.
-- Prerequisite: migrations 0001 through 0008 have been applied.
-- Prices are NGN minor units (kobo); positive inventory drives the generated
-- in_stock column, and metadata.stock_status is synchronized for exports.
-- Safe to rerun: both blocks upsert by the unique products.sku key.
-- ============================================================================

begin;

-- Original ten catalog products.
insert into public.products
  (sku, slug, name, description, brand, category, usage_tags,
   unit_price_minor, inventory_qty, shipping_class, image_urls)
values
  ('HK-IPC-T124', 'hikvision-acuSense-t124-4mp-dome',
   'Hikvision DS-2CD2143G2-IU AcuSense 4MP Dome',
   'Vandal-resistant 4MP dome with AcuSense human/vehicle filtering, built-in mic, and IR to 30 m. PoE.',
   'Hikvision', 'cameras', array['cctv','outdoor','poe','smb'],
   18500000, 42, 'standard', '{}'),

  ('HK-NVR-7632', 'hikvision-7632n-i3s8-32ch-nvr',
   'Hikvision DS-7632NI-I3/8S 32-Channel NVR',
   '32-channel, 8 SATA bays, 400 Mbps incoming, AcuSense-linked analytics, HDMI+VGA out.',
   'Hikvision', 'recorders', array['cctv','enterprise','storage'],
   74500000, 9, 'bulky', '{}'),

  ('DH-IPC-HFW3549', 'dahua-wizmind-5mp-bullet',
   'Dahua IPC-HFW3549T1S-AS-PV WizSense 5MP Bullet',
   '5MP bullet with audio+light deterrence, starlight sensor, IP67. Ideal for perimeter lines.',
   'Dahua', 'cameras', array['cctv','outdoor','poe','smb'],
   16200000, 35, 'standard', '{}'),

  ('CC-C9200-48P', 'cisco-catalyst-9200-48p-4x',
   'Cisco Catalyst C9200-48P-4X 48-Port PoE+ Switch',
   'Layer 2/3 access switch, 4x10G uplinks, Network Essentials. The backbone for multi-VLAN CCTV fabrics.',
   'Cisco', 'networking', array['enterprise','poe','core'],
   395000000, 4, 'bulky', '{}'),

  ('MK-CCR2004', 'mikrotik-ccr2004g-2s-20t',
   'MikroTik CCR2004-2S-20T Cloud Core Router',
   '20-core routing platform with 2x SFP+ and 20x 10G RJ45. Built for ISP and campus edge BGP.',
   'MikroTik', 'networking', array['isp','enterprise','wireless-backhaul'],
   69000000, 12, 'standard', '{}'),

  ('UB-U6-LR', 'ubiquiti-u6-long-range-ap',
   'Ubiquiti UniFi U6 Long-Range Access Point',
   'Wi-Fi 6, 5.1 Gbps aggregate, powered coverage across courtyards and warehouse floors. UniFi managed.',
   'Ubiquiti', 'wireless', array['isp','smb','wifi'],
   24500000, 58, 'standard', '{}'),

  ('UB-ROCK-5X', 'ubiquiti-dream-machine-roller',
   'Ubiquiti UniFi Dream Machine Pro Max (UDM-Pro-Max)',
   'Security gateway + controller with 10G SFP+ WAN/LAN, deep packet inspection at multi-gigabit.',
   'Ubiquiti', 'networking', array['smb','wifi','core'],
   58500000, 17, 'standard', '{}'),

  ('DT-ONV-24P', 'dintek-onvif-24p-managed-switch',
   'Dintek 24-Port ONVIF Managed PoE Switch',
   'Budget CCTV-class managed switch with ONVIF profile support and PoE budgets tuned for NVR uplinks.',
   'Dintek', 'networking', array['cctv','poe','smb'],
   12800000, 26, 'standard', '{}'),

  ('CM-PTMP-600', 'cambium-cnmae-pmp-600',
   'Cambium Networks PMP 450m 600 Mbps Sector Antenna',
   'Licensed-band fixed-wireless access sector for last-mile ISP distribution.',
   'Cambium', 'wireless', array['isp','wireless-backhaul','outdoor'],
   93000000, 6, 'bulky', '{}'),

  ('HK-DS-1280', 'hikvision-wall-mount-bracket',
   'Hikvision DS-1280ZJ-S36 Wall Bracket (Steel)',
   'Heavy-duty steel junction bracket for dome installs. Ships flat, cuts install time on ramped jobs.',
   'Hikvision', 'accessories', array['cctv','smb'],
   950000, 240, 'standard', '{}')
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
  is_active = true,
  updated_at = now();

-- Twenty expansion products.
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

-- Human-readable stock state for all curated rows. products.in_stock remains
-- the generated database source of truth (inventory_qty > 0).
update public.products
set metadata = coalesce(metadata, '{}'::jsonb) ||
  jsonb_build_object(
    'stock_status',
    case when inventory_qty > 0 then 'In stock' else 'Out of stock' end
  ),
  updated_at = now()
where sku in (
    'HK-IPC-T124',
    'HK-NVR-7632',
    'DH-IPC-HFW3549',
    'CC-C9200-48P',
    'MK-CCR2004',
    'UB-U6-LR',
    'UB-ROCK-5X',
    'DT-ONV-24P',
    'CM-PTMP-600',
    'HK-DS-1280',
    'HK-IPC-B2043',
    'HK-IPC-CV4MP',
    'HK-NVR-7608-8P',
    'DH-IPC-HDW2449',
    'DH-IPC-HFW3849',
    'DH-NVR-4216-16P',
    'CC-CBS350-24P',
    'CC-CBS250-8PP',
    'MK-RB5009',
    'MK-CRS326-24G',
    'MK-E60IGS',
    'UB-U7-PRO',
    'UB-USW-PRO-24P',
    'UB-NS-5ACL',
    'DT-C6-305-GR',
    'DT-PP24-C6',
    'CM-F300-25L',
    'CM-XV2-2T0',
    'HK-DS-1273ZJ',
    'DH-NVR-4108-8P'
);

-- Fail the transaction rather than silently leaving a partial catalog.
do $$
declare
  seeded_count integer;
begin
  select count(*) into seeded_count
  from public.products
  where is_active and sku in (
    'HK-IPC-T124',
    'HK-NVR-7632',
    'DH-IPC-HFW3549',
    'CC-C9200-48P',
    'MK-CCR2004',
    'UB-U6-LR',
    'UB-ROCK-5X',
    'DT-ONV-24P',
    'CM-PTMP-600',
    'HK-DS-1280',
    'HK-IPC-B2043',
    'HK-IPC-CV4MP',
    'HK-NVR-7608-8P',
    'DH-IPC-HDW2449',
    'DH-IPC-HFW3849',
    'DH-NVR-4216-16P',
    'CC-CBS350-24P',
    'CC-CBS250-8PP',
    'MK-RB5009',
    'MK-CRS326-24G',
    'MK-E60IGS',
    'UB-U7-PRO',
    'UB-USW-PRO-24P',
    'UB-NS-5ACL',
    'DT-C6-305-GR',
    'DT-PP24-C6',
    'CM-F300-25L',
    'CM-XV2-2T0',
    'HK-DS-1273ZJ',
    'DH-NVR-4108-8P'
  );

  if seeded_count <> 30 then
    raise exception 'Catalog seed incomplete: expected 30 active curated products, found %', seeded_count;
  end if;
end $$;

commit;

-- SQL Editor/psql verification result: expected curated_products = 30.
select count(*) as curated_products,
       count(*) filter (where in_stock) as in_stock_products
from public.products
where is_active and sku in (
    'HK-IPC-T124',
    'HK-NVR-7632',
    'DH-IPC-HFW3549',
    'CC-C9200-48P',
    'MK-CCR2004',
    'UB-U6-LR',
    'UB-ROCK-5X',
    'DT-ONV-24P',
    'CM-PTMP-600',
    'HK-DS-1280',
    'HK-IPC-B2043',
    'HK-IPC-CV4MP',
    'HK-NVR-7608-8P',
    'DH-IPC-HDW2449',
    'DH-IPC-HFW3849',
    'DH-NVR-4216-16P',
    'CC-CBS350-24P',
    'CC-CBS250-8PP',
    'MK-RB5009',
    'MK-CRS326-24G',
    'MK-E60IGS',
    'UB-U7-PRO',
    'UB-USW-PRO-24P',
    'UB-NS-5ACL',
    'DT-C6-305-GR',
    'DT-PP24-C6',
    'CM-F300-25L',
    'CM-XV2-2T0',
    'HK-DS-1273ZJ',
    'DH-NVR-4108-8P'
);
