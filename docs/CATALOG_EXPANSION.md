# Catalog expansion — 2026-09-28

## Deliverables

- `supabase/migrations/0010_catalog_expansion.sql` adds 20 products.
- `src/lib/demo/data.ts` mirrors the same 20 rows, so offline/demo mode also contains 30 products.
- Every row uses an existing brand and category, has cross-filter `usage_tags`, positive `inventory_qty`, and `metadata.stock_status = "In stock"`.
- Prices use the repository's money contract: integer **NGN kobo**. Example: ₦325,000.00 is `32500000`, not `325000`.

## Research and pricing basis

Models/specifications were checked against manufacturer or distributor product pages. Nigerian prices are a dated retail snapshot and should be reviewed before each procurement cycle because FX, freight, duty and channel stock move quickly.

Representative sources:

- MikroTik RB5009UG+S+IN specifications and USD MSRP: https://mikrotik.com/product/rb5009ug_s_in
- MikroTik hEX S (2025), RB5009 and CRS326 range: https://mikrotik.com/products and https://mikrotikafrica.com/
- Nigerian RB5009 market reference (₦295,000–₦325,000 observed): https://jiji.ng/386-routers/mikrotik
- Hikvision DS-7608NI-K2/8P model/market reference: https://www.hikdistribution.com/products/8-ch-1u-8-poe-4k-nvr-ds-7608ni-k2-8p
- Dahua IP camera range/specification reference: https://www.dahuasecurity.com/mena/products/All-Products/Network-Cameras
- Cambium Force 300-25L Nigerian listing (₦311,536 observed): https://cctech.ng/product/cambium-networks-c050910m471a-epmp-force-300-25l-5ghz-radio-with-25-dbi-dish-antenna-6-pack-bulk-packaging-priced-per-one-unit-row-sold-in-quantities-by-6-only/
- Cambium Force 300-25 capabilities: https://www.winncom.com/en/products/C050910C104A
- Dintek Cat.6 UTP 305 m Nigerian listing (₦34,300 observed): https://microviewng.com/dintek/dintek-cat-6-utp-cable-grey-305m/

The SQL intentionally uses `ON CONFLICT (sku) DO UPDATE`, making it safe to rerun and useful for periodic price/stock refreshes. It never modifies carts, checkout, orders, payment data or services.

## Apply to production — easiest path

1. In Supabase Dashboard, open the intended live project. Confirm its project ref matches the deployed health endpoint's `env.supabaseProjectRef`.
2. Open **SQL Editor → New query**.
3. Paste the complete contents of `supabase/migrations/0010_catalog_expansion.sql` and click **Run**.
4. Verify:

```sql
select count(*) as active_products
from public.products
where is_active;

select sku, name, brand, category,
       unit_price_minor,
       unit_price_minor / 100.0 as price_ngn,
       inventory_qty, in_stock,
       metadata ->> 'stock_status' as stock_status,
       usage_tags
from public.products
where sku in (
  'HK-IPC-B2043', 'HK-IPC-CV4MP', 'HK-NVR-7608-8P',
  'DH-IPC-HDW2449', 'DH-IPC-HFW3849', 'DH-NVR-4216-16P',
  'CC-CBS350-24P', 'CC-CBS250-8PP', 'MK-RB5009',
  'MK-CRS326-24G', 'MK-E60IGS', 'UB-U7-PRO',
  'UB-USW-PRO-24P', 'UB-NS-5ACL', 'DT-C6-305-GR',
  'DT-PP24-C6', 'CM-F300-25L', 'CM-XV2-2T0',
  'HK-DS-1273ZJ', 'DH-NVR-4108-8P'
)
order by brand, name;
```

Expected: at least `30` active products; every listed row has `in_stock = true` and `stock_status = In stock`.

5. Check `/api/health` returns `"mode":"live"`, the expected project ref and `activeProducts >= 30`. Then open `/products`; no Netlify redeploy is required for a database-only seed because catalog pages are dynamic.

CLI alternative for teams already using linked Supabase CLI:

```bash
supabase db push
```

The SQL Editor is the least setup and lowest-friction production path.
