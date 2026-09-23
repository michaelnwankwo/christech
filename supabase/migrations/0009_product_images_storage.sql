-- ============================================================================
-- Chrisviscus Technologies — 0009_product_images_storage
-- Public bucket for admin-uploaded product images + staff-only object
-- mutations. Run in the Supabase dashboard SQL Editor (browser), like all
-- previous migrations. Unlike the auth schema, storage.* is fully reachable
-- from the dashboard role.
--
-- The storefront loads these through the PUBLIC object endpoint
--   https://<project-ref>.supabase.co/storage/v1/object/public/product-images/<path>
-- which the storage gateway serves without RLS precisely because the bucket
-- is flagged public; the SELECT policy below additionally lets signed-in
-- clients list/browse the bucket from the admin UI.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read for the admin preview/list flow (storefront <img> traffic goes
-- through the public endpoint and never evaluates policies).
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

-- Uploads/updates: staff+admin only, and ONLY under products/. The path
-- convention mirrors src/lib/supabase/storage.ts exactly:
--   products/<epoch-ms>-<7 base36 chars>.<ext>
drop policy if exists product_images_staff_insert on storage.objects;
create policy product_images_staff_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_staff()
  and (storage.foldername(name))[1] = 'products'
);

drop policy if exists product_images_staff_update on storage.objects;
create policy product_images_staff_update
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_staff())
with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists product_images_staff_delete on storage.objects;
create policy product_images_staff_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_staff());
