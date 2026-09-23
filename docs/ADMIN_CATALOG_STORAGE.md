# Admin Catalog, Product Images & Google OAuth — Runbook

## 1 · Database (browser — Supabase dashboard)
All schema for this feature already exists via migrations 0001–0008
(`products`, `categories`, `is_staff()`, RLS incl. `products_staff_write`).
The only NEW migration this round is:

    supabase/migrations/0009_product_images_storage.sql

Apply it like the others: dashboard → SQL Editor → paste the whole file →
Run. It is idempotent (safe to re-run). It creates:
- public `product-images` storage bucket;
- storage policies: anyone may read bucket objects; only staff/admin may
  insert/update/delete, and only under `products/`.

**Do NOT re-run 0001+** on a live database — `create type user_role` etc.
are not idempotent (that's the `42710 type already exists` you saw once).
Verification is pure-SELECT and always safe:

    select (select count(*) from public.products)          as products,
           (select count(*) from public.categories)         as categories,
           (select count(*) from public.services)           as services,
           (select count(*) from public.shipping_rate_cards)as shipping_cards;

## 2 · First admin account
1. Sign up on the site normally (https://…/signup) → confirm email if
   required.
2. In the dashboard SQL Editor (browser, not PowerShell):

       update public.users set role = 'admin' where email = 'you@example.com';

   (The `protect_user_identity` trigger blocks self-role escalation from the
   client — this dashboard edit bypasses it by design; do it once per admin.)
3. Visit `/admin/products`. The layout gates: session → `users.role in
   ('staff','admin')` → Postgres RLS `products_staff_write` again on every
   query.

## 3 · Catalog editing (`/admin/products`)
- Create/Edit form: `src/components/admin/ProductForm.tsx`; mutations go
  through `src/app/admin/products/actions.ts` (zod validation,
  `parseNairaToMinor`, category cross-checked against `public.categories`).
- Money contract: the form collects naira as TEXT; the server converts to
  minor units. `in_stock` is generated from `inventory_qty > 0` (0008) —
  never set it directly.
- Soft delete = uncheck "Visible in the storefront" (flips `is_active`;
  inactive rows stay visible to staff, vanish from public reads).
- Hard delete is for products that were never ordered; if Postgres refuses
  (order history references), Hide instead — that's the intended record
  retention.
- SKU/slug collisions come back as an inline field error, not a crash.

## 4 · Product images
`src/components/admin/ImageUploader.tsx` → drag-drop/picker (.jpg/.png/.webp,
≤4 MB, ≤12 per product). Upload path is generated server-side style:
`products/<epoch-ms>-<random>.<ext>` — never user text (path-injection guard
mirrored by the 0009 policy). Previews support reorder (first image =
storefront cover) and delete (removes the object best-effort). Stored on the
product row as `image_urls[]` of public URLs:
`https://<project-ref>.supabase.co/storage/v1/object/public/product-images/products/….jpg`

Admin previews use plain `<img>` on purpose (no next/image remotePatterns
dependency for the CMS surface). The storefront image pipeline keeps its own
config.

## 5 · Google OAuth — wired, currently OFF
`GoogleSignInButton` renders only when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED="true"`.
To switch it on:
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID
   (Web). Authorized redirect URI:
   `https://fmjfwkgrrwacmdecixjq.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Google: enable, paste Client ID +
   Secret.
3. Supabase → Authentication → URL Configuration:
   - Site URL: `https://chrisviscustech.netlify.app`
   - Additional Redirect URLs: `https://chrisviscustech.netlify.app/**`,
     `http://localhost:3000/**`
4. Netlify: `npx netlify env:set NEXT_PUBLIC_AUTH_GOOGLE_ENABLED "true"`
   then redeploy (NEXT_PUBLIC_* bakes at build).

## 6 · Password reset flow
`/forgot-password` → `resetPasswordForEmail` → Supabase "Recovery" email →
`/auth/callback?next=/update-password` (code exchanged) → new password via
`updateUser` → sign out → `/login?reset=1` banner. Requires nothing beyond
the default email template; customize it per docs/TRANSACTIONAL_EMAIL_SMTP.md.
