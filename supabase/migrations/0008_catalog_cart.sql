-- ============================================================================
-- Chrisviscus Technologies — 0008_catalog_cart
-- Catalog reference table (categories), the derived in_stock flag on products,
-- and the durable cart mirror (cart_items) with guest staging + login merge.
--
-- Design notes:
--  * products.category STAYS the denormalized text column the whole app (and
--    the demo mirror) already speaks. public.categories is the admin-editable
--    reference surface (labels, order) — turning the FK into the source of
--    truth would be a reviewed, app-wide migration, not a bolt-on.
--  * `price` per the platform brief = unit_price_minor (bigint, NGN KOBO —
--    the repo's single money contract). `stock_quantity` = inventory_qty.
--    in_stock is the GENERATED view of inventory_qty > 0 that the brief asks
--    for, so client filters can never disagree with stock math.
--  * cart_items is a MIRROR, never a money authority: checkout re-prices every
--    line server-side from products/services (0005 guards). A tampered cart
--    row can only change quantities/selections, never amounts — those are
--    re-read at quote/charge time regardless.
--  * Guest rows are addressable ONLY by the x-cart-session header their
--    session_id was minted with (capability model: possession of a random
--    uuid = access to that anonymous bucket; no PII, no amounts stored).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Categories reference table (public read, staff write — mirrors the
--    products policy shape from 0003).
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy categories_public_read
  on public.categories for select
  using (true);

create policy categories_staff_write
  on public.categories for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

insert into public.categories (name, slug, sort_order) values
  ('Cameras',      'cameras',     10),
  ('Recorders',    'recorders',    20),
  ('Networking',   'networking',   30),
  ('Wireless',     'wireless',     40),
  ('Accessories',  'accessories',  50)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. products.in_stock — GENERATED ALWAYS, so it can never drift from
--    inventory_qty (no trigger, no dual-write). Partial index serves the
--    storefront's active-catalog read pattern.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists in_stock boolean
  generated always as (inventory_qty > 0) stored;

create index if not exists products_in_stock_active_idx
  on public.products (in_stock, category)
  where is_active;

-- ---------------------------------------------------------------------------
-- 3. cart_items — durable mirror of the local (Zustand+localStorage) cart.
--    Exactly one owner: an authed user_id OR an anon session_id (CHECK), and
--    at most one row per product per owner (partial UNIQUE indexes double as
--    the upsert conflict targets: cart_items_user_product_uidx /
--    cart_items_session_product_uidx).
-- ---------------------------------------------------------------------------
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.users(id) on delete cascade,
  session_id text check (session_id is null or char_length(session_id) between 8 and 64),

  product_id uuid not null references public.products(id) on delete cascade,

  quantity integer not null default 1
    check (quantity between 1 and 999),          -- mirrors the store clamp

  -- service ids of checked add-ons ("Hikvision Commissioning", …), stored
  -- per product line exactly as the client groups them under its parent.
  selected_addons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_addons) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cart_items_owner_exclusive check (
    (user_id is not null and session_id is null) or
    (user_id is null and session_id is not null)
  )
);

create unique index cart_items_user_product_uidx
  on public.cart_items (user_id, product_id)
  where user_id is not null;

create unique index cart_items_session_product_uidx
  on public.cart_items (session_id, product_id)
  where session_id is not null;

create trigger cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

alter table public.cart_items enable row level security;

-- Signed-in: full CRUD of ONLY your own rows (and user rows never carry a
-- session_id — the owner-exclusive CHECK + this WITH CHECK both enforce).
create policy cart_items_owner_rw
  on public.cart_items for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and session_id is null);

-- Guest: rows are visible/writable only to a request presenting the matching
-- x-cart-session header. current_setting('request.headers') is PostgREST's
-- jsonb of incoming headers; empty/missing header ⇒ '' ⇒ matches no row
-- (session ids are 8..64 chars by CHECK above).
create policy cart_items_guest_select
  on public.cart_items for select
  to anon
  using (
    session_id is not null
    and session_id = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-cart-session', ''),
      ''
    )
  );

create policy cart_items_guest_write
  on public.cart_items for insert
  to anon
  with check (
    user_id is null
    and session_id = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-cart-session', ''),
      ''
    )
  );

create policy cart_items_guest_update
  on public.cart_items for update
  to anon
  using (
    session_id is not null
    and session_id = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-cart-session', ''),
      ''
    )
  )
  with check (
    user_id is null
    and session_id = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-cart-session', ''),
      ''
    )
  );

create policy cart_items_guest_delete
  on public.cart_items for delete
  to anon
  using (
    session_id is not null
    and session_id = coalesce(
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-cart-session', ''),
      ''
    )
  );

-- Staff may clean up cart rows in emergencies (matches products write shape).
create policy cart_items_staff_rw
  on public.cart_items for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 4. merge_guest_cart — login fold-in. SECURITY DEFINER because the caller is
--    mid-auth-transition (their anon-bucket rows belong to the OLD role
--    context; RLS on authenticated can't see them). Reads the guest bucket by
--    SESSION_ID and attributes every row to auth.uid() — the caller cannot
--    name a victim: the function only ever writes rows it just re-owns, and
--    quantities/add-ons merge conservatively (sum capped at the 999 clamp,
--    add-on union). Returns the number of guest rows folded.
-- ---------------------------------------------------------------------------
create or replace function public.merge_guest_cart(p_session_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folded integer;
begin
  if p_session_id is null or length(trim(p_session_id)) < 8 then
    return 0;
  end if;
  if auth.uid() is null then
    return 0;  -- anonymous logins never own user rows
  end if;

  insert into public.cart_items (user_id, product_id, quantity, selected_addons)
  select
    auth.uid(),
    g.product_id,
    g.quantity,
    g.selected_addons
  from public.cart_items g
  where g.session_id = p_session_id
    and g.user_id is null
    -- never resurrect rows pointing at deactivated catalog entries
    and exists (select 1 from public.products p
                where p.id = g.product_id and p.is_active)
  on conflict (user_id, product_id) where user_id is not null
  do update set
    quantity = least(public.cart_items.quantity + excluded.quantity, 999),
    selected_addons = (
      select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
      from jsonb_array_elements(
        public.cart_items.selected_addons || excluded.selected_addons
      ) e
    ),
    updated_at = now();

  get diagnostics v_folded = row_count;

  delete from public.cart_items g
  where g.session_id = p_session_id
    and g.user_id is null;

  return v_folded;
end;
$$;

revoke all on function public.merge_guest_cart(text) from public;
grant execute on function public.merge_guest_cart(text) to authenticated;

comment on table public.cart_items is
  'Durable mirror of the client cart (never a money source; checkout re-prices server-side per 0005).';
comment on column public.cart_items.session_id is
  'Anonymous device bucket; cross-checked against the x-cart-session header by RLS.';
comment on column public.products.in_stock is
  'GENERATED (inventory_qty > 0) — the canonical availability flag.';
