-- 0013_cart_upsert_conflict_targets.sql
--
-- PostgREST/Supabase upserts infer a unique index from a column-list conflict
-- target. They do not accept an index name in the `on_conflict` parameter.
--
-- The original partial indexes cannot be inferred from an unqualified
-- `ON CONFLICT (user_id, product_id)` because that conflict target has no
-- matching WHERE predicate. Non-partial indexes preserve the intended
-- uniqueness: PostgreSQL permits multiple NULLs, while
-- cart_items_owner_exclusive guarantees exactly one non-NULL owner key.

begin;

-- Existing partial uniqueness guarantees there cannot already be duplicate
-- non-NULL owner/product pairs, so these replacements are safe.
drop index if exists public.cart_items_user_product_uidx;
drop index if exists public.cart_items_session_product_uidx;

create unique index cart_items_user_product_uidx
  on public.cart_items (user_id, product_id);

create unique index cart_items_session_product_uidx
  on public.cart_items (session_id, product_id);

-- Ensure PostgREST notices the changed conflict targets immediately after the
-- migration commits.
notify pgrst, 'reload schema';

commit;
