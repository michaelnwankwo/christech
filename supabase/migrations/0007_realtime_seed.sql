-- ============================================================================
-- Chrisviscus Technologies — 0007_realtime_seed
-- Supabase Realtime publication (§16.1) + catalog seeding (§20.2 steps 4–5).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Realtime: publish orders + order_events so the customer dashboard and the
-- Live Order Tracking sidebar react to fulfillment and payment transitions.
-- Guarded so this migration is safe on non-Supabase Postgres and re-runnable.
-- Subscriber-side RLS still applies — a customer only receives rows for
-- orders they own (policies in 0003).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  begin
    execute 'alter publication supabase_realtime add table public.orders';
  exception when duplicate_object then
    null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.order_events';
  exception when duplicate_object then
    null;
  end;
end;
$$;

-- Full row images let consumers diff from_status -> to_status transitions.
alter table public.orders replica identity full;
alter table public.order_events replica identity full;

-- ---------------------------------------------------------------------------
-- Seed — shipping rate cards (NGN minor units). All nine zones x two
-- classes; 'standard' doubles as the fallback class (see 0004).
-- ---------------------------------------------------------------------------
insert into public.shipping_rate_cards (zone_code, shipping_class, amount_minor) values
  ('lagos-mainland', 'standard', 350_000),   -- ₦3,500
  ('lagos-mainland', 'bulky',    1_200_000), -- ₦12,000
  ('lagos-island',   'standard', 450_000),
  ('lagos-island',   'bulky',    1_500_000),
  ('abuja',          'standard', 600_000),
  ('abuja',          'bulky',    2_000_000),
  ('south-west',     'standard', 700_000),
  ('south-west',     'bulky',    2_200_000),
  ('south-east',     'standard', 900_000),
  ('south-east',     'bulky',    2_800_000),
  ('south-south',    'standard', 950_000),
  ('south-south',    'bulky',    2_900_000),
  ('north',          'standard', 1_100_000),
  ('north',          'bulky',    3_200_000),
  ('ng-other',       'standard', 1_000_000),
  ('ng-other',       'bulky',    3_000_000),
  ('intl',           'standard', 7_500_000),
  ('intl',           'bulky',    15_000_000)
on conflict (zone_code, shipping_class) do nothing;

-- ---------------------------------------------------------------------------
-- Seed — products (prices NGN minor units; inventory sized for demos/tests).
-- ---------------------------------------------------------------------------
insert into public.products
  (sku, slug, name, description, brand, category, usage_tags,
   unit_price_minor, inventory_qty, shipping_class, image_urls)
values
  ('HK-IPC-T124', 'hikvision-acuSense-t124-4mp-dome',
   'Hikvision DS-2CD2143G2-IU AcuSense 4MP Dome',
   'Vandal-resistant 4MP dome with AcuSense human/vehicle filtering, built-in mic, and IR to 30 m. PoE.',
   'Hikvision', 'cameras', array['cctv','outdoor','poe','smb'],
   185_000_00, 42, 'standard', '{}'),

  ('HK-NVR-7632', 'hikvision-7632n-i3s8-32ch-nvr',
   'Hikvision DS-7632NI-I3/8S 32-Channel NVR',
   '32-channel, 8 SATA bays, 400 Mbps incoming, AcuSense-linked analytics, HDMI+VGA out.',
   'Hikvision', 'recorders', array['cctv','enterprise','storage'],
   745_000_00, 9, 'bulky', '{}'),

  ('DH-IPC-HFW3549', 'dahua-wizmind-5mp-bullet',
   'Dahua IPC-HFW3549T1S-AS-PV WizSense 5MP Bullet',
   '5MP bullet with audio+light deterrence, starlight sensor, IP67. Ideal for perimeter lines.',
   'Dahua', 'cameras', array['cctv','outdoor','poe','smb'],
   162_000_00, 35, 'standard', '{}'),

  ('CC-C9200-48P', 'cisco-catalyst-9200-48p-4x',
   'Cisco Catalyst C9200-48P-4X 48-Port PoE+ Switch',
   'Layer 2/3 access switch, 4x10G uplinks, Network Essentials. The backbone for multi-VLAN CCTV fabrics.',
   'Cisco', 'networking', array['enterprise','poe','core'],
   3_950_000_00, 4, 'bulky', '{}'),

  ('MK-CCR2004', 'mikrotik-ccr2004g-2s-20t',
   'MikroTik CCR2004-2S-20T Cloud Core Router',
   '20-core routing platform with 2x SFP+ and 20x 10G RJ45. Built for ISP and campus edge BGP.',
   'MikroTik', 'networking', array['isp','enterprise','wireless-backhaul'],
   690_000_00, 12, 'standard', '{}'),

  ('UB-U6-LR', 'ubiquiti-u6-long-range-ap',
   'Ubiquiti UniFi U6 Long-Range Access Point',
   'Wi-Fi 6, 5.1 Gbps aggregate, powered coverage across courtyards and warehouse floors. UniFi managed.',
   'Ubiquiti', 'wireless', array['isp','smb','wifi'],
   245_000_00, 58, 'standard', '{}'),

  ('UB-ROCK-5X', 'ubiquiti-dream-machine-roller',
   'Ubiquiti UniFi Dream Machine Pro Max (UDM-Pro-Max)',
   'Security gateway + controller with 10G SFP+ WAN/LAN, deep packet inspection at multi-gigabit.',
   'Ubiquiti', 'networking', array['smb','wifi','core'],
   585_000_00, 17, 'standard', '{}'),

  ('DT-ONV-24P', 'dintek-onvif-24p-managed-switch',
   'Dintek 24-Port ONVIF Managed PoE Switch',
   'Budget CCTV-class managed switch with ONVIF profile support and PoE budgets tuned for NVR uplinks.',
   'Dintek', 'networking', array['cctv','poe','smb'],
   128_000_00, 26, 'standard', '{}'),

  ('CM-PTMP-600', 'cambium-cnmae-pmp-600',
   'Cambium Networks PMP 450m 600 Mbps Sector Antenna',
   'Licensed-band fixed-wireless access sector for last-mile ISP distribution.',
   'Cambium', 'wireless', array['isp','wireless-backhaul','outdoor'],
   930_000_00, 6, 'bulky', '{}'),

  ('HK-DS-1280', 'hikvision-wall-mount-bracket',
   'Hikvision DS-1280ZJ-S36 Wall Bracket (Steel)',
   'Heavy-duty steel junction bracket for dome installs. Ships flat, cuts install time on ramped jobs.',
   'Hikvision', 'accessories', array['cctv','smb'],
   9_500_00, 240, 'standard', '{}')
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- Seed — services: 'add_on' lines join storefront carts; 'booking' services
-- drive the service platform. The kind column + triggers keep the two
-- worlds apart no matter what a client sends.
-- ---------------------------------------------------------------------------
insert into public.services
  (slug, name, description, kind, base_price_minor, duration_minutes, requires_schedule)
values
  -- purchasable add-ons
  ('addon-cctv-commissioning', 'CCTV Commissioning & Network Tuning',
   'Certified engineer configures cameras, NVR retention, VLANs, and remote viewing at delivery.',
   'add_on', 45_000_00, 120, false),
  ('addon-firmware-hardening', 'Firmware & Security Hardening',
   'Firmware baseline, credential hygiene, port lockdown, and update policy for switches and APs.',
   'add_on', 30_000_00, 60, false),
  ('addon-extended-warranty-24m', 'Extended Warranty — 24 Months',
   'Chrisviscus-backed advance-swap warranty on top of the manufacturer warranty.',
   'add_on', 60_000_00, null, false),

  -- bookable services
  ('install-full-cctv-site', 'Full CCTV Site Installation',
   'End-to-end installation for homes and SME sites: cabling, mounting, NVR setup, handover docs.',
   'booking', 250_000_00, 480, true),
  ('network-audit-remediation', 'Network Audit & Remediation',
   'Structured audit of switching, routing, Wi-Fi coverage, and CCTV fabric with a written fix plan.',
   'booking', 180_000_00, 240, true),
  ('isp-link-installation', 'ISP Link Installation & Alignment',
   'Sector/panel mounting, alignment, PoE injection, and signal benchmarking for WISP links.',
   'booking', 210_000_00, 360, true),
  ('support-monthly-maintenance', 'Monthly Maintenance Retainer',
   'Scheduled preventive maintenance: inspections, firmware windows, cleaning, uptime reporting.',
   'booking', 150_000_00, 180, true)
on conflict (slug) do nothing;
