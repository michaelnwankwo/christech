# Apply and verify the 30-product catalog

`supabase/seed_30_products.sql` is the standalone production seed. It contains
all 30 curated products and is idempotent: every row is upserted by the unique
`sku`, so rerunning it does not create duplicates. Prices are integer NGN minor
units; inventory, generated `in_stock`, metadata stock status, categories and
usage tags are included.

## Easiest path: Supabase SQL Editor

1. Open the **main production project** in Supabase Dashboard.
2. Open **SQL Editor → New query**.
3. Paste the complete contents of `supabase/seed_30_products.sql`.
4. Click **Run**. The last result must report `curated_products = 30` and
   `in_stock_products = 30`.
5. Open `/api/health` and confirm `mode = "live"`, the expected production
   `supabaseProjectRef`, and `catalog.activeProducts >= 30`.
6. Open `/products`. The query window is 50 rows, so all 30 products render in
   the first storefront grid when no filters are active.

## One-command CLI path

Install the PostgreSQL client, copy the production connection string from
**Project Settings → Database → Connection string**, and run:

```bash
DATABASE_URL='postgresql://...' npm run db:seed:catalog
```

The script uses `ON_ERROR_STOP=1`; the SQL also runs in a transaction and
asserts all 30 curated SKUs, so a partial seed is rolled back.
