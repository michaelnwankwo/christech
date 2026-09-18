-- ============================================================================
-- CHRISVISCUS TECHNOLOGIES — COMPLETE SUPABASE SCHEMA BOOTSTRAP
-- Single-file concatenation of supabase/migrations/0001..0007, in order.
--
-- WHERE TO RUN: Supabase Dashboard → your project → SQL Editor → New query
-- → paste this entire file → Run. (Equivalent: `supabase db push` with the
-- migrations folder configured.) Run ONCE — statements are not idempotent
-- by design; re-running will raise "already exists" errors, which is the
-- correct signal that the schema is already applied.
--
-- Sections:
--   0001  Core schema (users, products, services, shipping, currency quotes,
--         orders, order_items, service_requests, payment/order events,
--         daily_sequences) + enums, domains, indexes, foreign keys
--   0002  Triggers (order number sequences, stock guard, booking state
--         machine, role-change guard, updated_at)
--   0003  Row-Level Security — anon can READ products/services/shipping only;
--         customers see their own orders; staff see everything; NO direct
--         INSERT on orders for anyone but staff
--   0004  Helper functions (is_staff, money formatting, etc.)
--   0005  Checkout RPCs — create_quote / create_order_from_quote
--         (SECURITY DEFINER — the ONLY way a customer-side session can
--         create an order; server reloads prices, enforces cart/address
--         hash match + TTL)
--   0006  Payment RPCs — finalize_paid_order, process_paystack_event
--         (idempotent via payment_events.event_key), cancel_expired_unpaid_orders,
--         purge_expired_quotes, archive_payment_event_payloads
--   0007  Realtime publication + seed catalog/prices/shipping rates
--
-- Verify afterwards with the queries at the very bottom of this file.
-- ============================================================================


-- ############################################################################
-- ## 0001_init.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0001_init
-- Extensions, enums, tables, indexes. Blueprint §4 (Database build).
--
-- Invariants encoded here (per blueprint §2, §4, §21.1):
--   * All monetary amounts are NGN minor units ("base"); FX snapshots are
--     stored per currency (display + charge) and never recomputed client-side.
--   * orders/order_items are immutable historical records (name/sku/price
--     snapshots). service_requests has NO order_id: bookings are decoupled.
--   * Every table has RLS-adjacent shape: user ownership FK + is_active flags.
-- ============================================================================

-- gen_random_uuid(), digest() for cart/address hashing.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums (§4.1)
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'staff', 'admin');

create type public.currency_code as enum ('NGN', 'USD', 'GBP', 'EUR');

create type public.service_kind as enum ('booking', 'add_on');

create type public.order_item_kind as enum ('product', 'service_addon');

create type public.order_status as enum (
  'pending_payment',
  'payment_review',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);

create type public.payment_status as enum (
  'pending',
  'initiated',
  'paid',
  'failed',
  'refunded'
);

create type public.service_request_status as enum (
  'requested',
  'under_review',
  'quoted',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'rejected'
);

-- ---------------------------------------------------------------------------
-- 4.2 Users — profile mirror of auth.users; role is the authorization source.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,

  email text,
  full_name text,
  phone text,

  role public.user_role not null default 'customer',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_lower_idx
  on public.users (lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 4.3 Products — physical catalog. Prices are NGN minor units.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),

  sku text not null unique,
  slug text not null unique,

  name text not null,
  description text,

  brand text not null check (
    brand in (
      'Hikvision',
      'Dahua',
      'Cisco',
      'MikroTik',
      'Ubiquiti',
      'Dintek',
      'Cambium',
      'Other'
    )
  ),

  category text not null,
  usage_tags text[] not null default '{}',

  image_urls text[] not null default '{}',

  -- Store prices are NGN; the pinned base_currency check below makes a
  -- future multi-base migration an explicit, reviewed change.
  base_currency public.currency_code not null default 'NGN',
  unit_price_minor bigint not null check (unit_price_minor >= 0),

  inventory_qty integer not null default 0
    check (inventory_qty >= 0),

  shipping_class text not null default 'standard',
  is_active boolean not null default true,

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_base_currency_ngn check (base_currency = 'NGN')
);

create index products_active_category_idx
  on public.products (is_active, category);

create index products_active_brand_idx
  on public.products (is_active, brand);

create index products_usage_tags_gin_idx
  on public.products using gin (usage_tags);

-- ---------------------------------------------------------------------------
-- 4.4 Services — one table, two kinds. kind discriminates booking (service
-- domain) from add_on (storefront domain). They never cross over.
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique,
  name text not null,
  description text,

  kind public.service_kind not null,

  base_currency public.currency_code not null default 'NGN',
  base_price_minor bigint not null check (base_price_minor >= 0),

  duration_minutes integer
    check (duration_minutes is null or duration_minutes > 0),

  is_shippable boolean not null default false,
  shipping_class text,

  requires_schedule boolean not null default false,
  is_active boolean not null default true,

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_base_currency_ngn check (base_currency = 'NGN'),
  constraint shippable_service_requires_class
    check (
      is_shippable = false
      or shipping_class is not null
    )
);

create index services_kind_active_idx
  on public.services (kind, is_active);

-- ---------------------------------------------------------------------------
-- 4.5 Shipping rate cards — server-authoritative zone x class pricing.
-- ---------------------------------------------------------------------------
create table public.shipping_rate_cards (
  id uuid primary key default gen_random_uuid(),

  zone_code text not null,
  shipping_class text not null,

  base_currency public.currency_code not null default 'NGN',
  amount_minor bigint not null check (amount_minor >= 0),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shipping_base_currency_ngn check (base_currency = 'NGN'),
  unique (zone_code, shipping_class)
);

-- ---------------------------------------------------------------------------
-- 4.6 Currency quotes — short-lived, server-created quote snapshots.
-- The browser carries ONLY the quote id; every amount below is server math.
-- ---------------------------------------------------------------------------
create table public.currency_quotes (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.users(id) on delete cascade,

  base_currency public.currency_code not null default 'NGN'
    check (base_currency = 'NGN'),

  display_currency public.currency_code not null,
  charge_currency public.currency_code not null,

  base_to_display_rate numeric(24, 12) not null
    check (base_to_display_rate > 0),

  base_to_charge_rate numeric(24, 12) not null
    check (base_to_charge_rate > 0),

  zone_code text not null,

  subtotal_base_minor bigint not null check (subtotal_base_minor >= 0),
  shipping_base_minor bigint not null check (shipping_base_minor >= 0),
  total_base_minor bigint not null check (total_base_minor >= 0),

  subtotal_display_minor bigint not null check (subtotal_display_minor >= 0),
  shipping_display_minor bigint not null check (shipping_display_minor >= 0),
  total_display_minor bigint not null check (total_display_minor >= 0),

  subtotal_charge_minor bigint not null check (subtotal_charge_minor >= 0),
  shipping_charge_minor bigint not null check (shipping_charge_minor >= 0),
  total_charge_minor bigint not null check (total_charge_minor >= 0),

  cart_hash text not null,
  shipping_address_hash text not null,

  rate_provider text not null,
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint quote_base_total_matches
    check (total_base_minor = subtotal_base_minor + shipping_base_minor),

  constraint quote_display_total_matches
    check (total_display_minor = subtotal_display_minor + shipping_display_minor),

  constraint quote_charge_total_matches
    check (total_charge_minor = subtotal_charge_minor + shipping_charge_minor)
);

create index currency_quotes_expiry_idx
  on public.currency_quotes (expires_at);

-- ---------------------------------------------------------------------------
-- 4.7 Orders — created atomically with items BEFORE Paystack opens (§15.4).
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),

  order_number text not null unique,
  payment_reference text not null unique,

  user_id uuid not null
    references public.users(id) on delete restrict,

  quote_id uuid not null
    references public.currency_quotes(id) on delete restrict,

  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',

  base_currency public.currency_code not null default 'NGN'
    check (base_currency = 'NGN'),

  display_currency public.currency_code not null,
  charge_currency public.currency_code not null,

  fx_rate_base_to_display numeric(24, 12) not null
    check (fx_rate_base_to_display > 0),

  fx_rate_base_to_charge numeric(24, 12) not null
    check (fx_rate_base_to_charge > 0),

  subtotal_base_minor bigint not null check (subtotal_base_minor >= 0),
  shipping_base_minor bigint not null check (shipping_base_minor >= 0),
  tax_base_minor bigint not null default 0 check (tax_base_minor >= 0),
  discount_base_minor bigint not null default 0 check (discount_base_minor >= 0),
  total_base_minor bigint not null check (total_base_minor >= 0),

  subtotal_display_minor bigint not null check (subtotal_display_minor >= 0),
  shipping_display_minor bigint not null check (shipping_display_minor >= 0),
  tax_display_minor bigint not null default 0 check (tax_display_minor >= 0),
  discount_display_minor bigint not null default 0 check (discount_display_minor >= 0),
  total_display_minor bigint not null check (total_display_minor >= 0),

  subtotal_charge_minor bigint not null check (subtotal_charge_minor >= 0),
  shipping_charge_minor bigint not null check (shipping_charge_minor >= 0),
  tax_charge_minor bigint not null default 0 check (tax_charge_minor >= 0),
  discount_charge_minor bigint not null default 0 check (discount_charge_minor >= 0),
  total_charge_minor bigint not null check (total_charge_minor >= 0),

  shipping_zone text not null,
  shipping_address jsonb not null,
  customer_email_snapshot text not null,

  paystack_transaction_id bigint,
  paid_at timestamptz,

  metadata jsonb not null default '{}',

  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint base_total_matches
    check (
      total_base_minor =
      subtotal_base_minor + shipping_base_minor + tax_base_minor - discount_base_minor
    ),

  constraint display_total_matches
    check (
      total_display_minor =
      subtotal_display_minor + shipping_display_minor + tax_display_minor - discount_display_minor
    ),

  constraint charge_total_matches
    check (
      total_charge_minor =
      subtotal_charge_minor + shipping_charge_minor + tax_charge_minor - discount_charge_minor
    )
);

-- A quote funds at most ONE order (blueprint §18.4 "idempotency keys for
-- checkout initialization"; this index makes quote double-spend impossible
-- even if the idempotency key is bypassed).
create unique index orders_quote_id_key
  on public.orders (quote_id);

-- Replay lookup for the client idempotency key (partial so orders created
-- without a key never collide).
create unique index orders_idempotency_key_idx
  on public.orders (user_id, (metadata ->> 'idempotency_key'))
  where metadata ? 'idempotency_key';

create index orders_status_created_idx
  on public.orders (status, created_at desc);

create index orders_user_created_idx
  on public.orders (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4.8 Order items — snapshot lines. parent_order_item_id models the
-- "add-on belongs to a product line" relation from the cart (§2.3).
-- ---------------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.orders(id) on delete cascade,

  item_kind public.order_item_kind not null,

  product_id uuid
    references public.products(id) on delete restrict,

  service_id uuid
    references public.services(id) on delete restrict,

  parent_order_item_id uuid
    references public.order_items(id) on delete cascade,

  quantity integer not null check (quantity > 0),

  name_snapshot text not null,
  sku_snapshot text,

  unit_price_base_minor bigint not null
    check (unit_price_base_minor >= 0),

  unit_price_display_minor bigint not null
    check (unit_price_display_minor >= 0),

  unit_price_charge_minor bigint not null
    check (unit_price_charge_minor >= 0),

  line_total_base_minor bigint generated always as
    (quantity * unit_price_base_minor) stored,

  line_total_display_minor bigint generated always as
    (quantity * unit_price_display_minor) stored,

  line_total_charge_minor bigint generated always as
    (quantity * unit_price_charge_minor) stored,

  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),

  constraint valid_item_reference check (
    (
      item_kind = 'product'
      and product_id is not null
      and service_id is null
      and parent_order_item_id is null
    )
    or
    (
      item_kind = 'service_addon'
      and product_id is null
      and service_id is not null
      and parent_order_item_id is not null
    )
  ),

  constraint item_cannot_parent_itself check (
    parent_order_item_id is null
    or parent_order_item_id <> id
  )
);

create index order_items_order_idx
  on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- 4.9 Service requests — the SERVICE domain. Deliberately has no order_id:
-- bookings are never storefront orders (blueprint §2.4).
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),

  request_number text not null unique,

  user_id uuid not null
    references public.users(id) on delete restrict,

  service_id uuid not null
    references public.services(id) on delete restrict,

  status public.service_request_status not null default 'requested',

  requested_start_at timestamptz,
  requested_end_at timestamptz,

  site_address jsonb not null,
  notes text,

  estimated_price_minor bigint
    check (
      estimated_price_minor is null
      or estimated_price_minor >= 0
    ),

  currency public.currency_code not null default 'NGN',
  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint valid_requested_window check (
    requested_end_at is null
    or requested_start_at is null
    or requested_end_at > requested_start_at
  )
);

create index service_requests_user_created_idx
  on public.service_requests (user_id, created_at desc);

create index service_requests_status_idx
  on public.service_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 4.10 Payment events — webhook journal; unique event_key = idempotency.
-- ---------------------------------------------------------------------------
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'paystack',
  event_key text not null unique,
  event_type text not null,

  order_id uuid
    references public.orders(id) on delete set null,

  payment_reference text,
  provider_amount_minor bigint,
  provider_currency text,
  provider_status text,

  signature_verified boolean not null default false,

  -- 0001 note: payloads are retained for audit; §20.4 archival job trims.
  payload jsonb not null,

  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index payment_events_order_idx
  on public.payment_events (order_id);

-- ---------------------------------------------------------------------------
-- 4.11 Order events — audit trail feeding Realtime timelines.
-- ---------------------------------------------------------------------------
create table public.order_events (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.orders(id) on delete cascade,

  event_type text not null,
  from_status public.order_status,
  to_status public.order_status,

  actor_user_id uuid
    references public.users(id) on delete set null,

  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index order_events_order_created_idx
  on public.order_events (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Daily business-reference counters (order numbers / request numbers).
-- Format: <PREFIX>-YYYYMMDD-0001. Gaps are acceptable; collisions are not.
-- ---------------------------------------------------------------------------
create table public.daily_sequences (
  seq_date date not null,
  kind text not null,
  last_value bigint not null default 0,

  primary key (seq_date, kind)
);

-- ############################################################################
-- ## 0002_triggers.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0002_triggers
-- Integrity + guard triggers. Blueprint §4.2, §4.8, §4.9, §4.12, §5.3.
-- All guard functions are SECURITY DEFINER with a pinned search_path so the
-- lookup of public.* cannot be hijacked by another schema on the caller's
-- path, and so they can read the tables they validate regardless of RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4.12 set_updated_at (shared by 5 tables)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create trigger shipping_rate_cards_updated_at
before update on public.shipping_rate_cards
for each row execute function public.set_updated_at();

create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger service_requests_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.2 Auth profile provisioning trigger
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 5.3 role-escalation guard: "A database trigger must prevent non-staff
-- users from changing their own role." IDENTITY (the primary key) is also
-- frozen: an UPDATE that re-points a row to another auth user would let an
-- attacker retarget ownership. Only staff (validated through public.users
-- itself) or the service role (administrative workflows, migrations) may
-- mutate role. INSERTs with a non-default role are blocked for anyone who is
-- not staff/service_role, closing the insert path too.
-- ---------------------------------------------------------------------------
create or replace function public.protect_user_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      if not (
        coalesce(auth.role(), '') = 'service_role'
        or public.is_staff()
      ) then
        raise exception 'Reassigning a user identity is not permitted'
          using errcode = '42501';
      end if;
    end if;

    if new.role is distinct from old.role then
      if not (
        coalesce(auth.role(), '') = 'service_role'
        or public.is_staff()
      ) then
        raise exception 'Only staff may change user roles'
          using errcode = '42501';
      end if;
    end if;
  else
    -- INSERT path: creating an out-of-band privileged row directly in
    -- public.users requires staff/service_role as well.
    if new.role is distinct from 'customer' then
      if not (
        coalesce(auth.role(), '') = 'service_role'
        or public.is_staff()
      ) then
        raise exception 'Privileged roles must be created through admin workflows'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger users_protect_identity
before insert or update on public.users
for each row execute function public.protect_user_identity();

-- ---------------------------------------------------------------------------
-- 4.8 order_items lineage guard.
-- The CHECK constraint in 0001 encodes shape (kind vs id columns); this
-- trigger encodes SEMANTICS:
--   * parent exists, belongs to the SAME order, and is a product line;
--   * an add-on references an ACTIVE service whose kind is exactly 'add_on'
--     -> a 'booking' service can therefore NEVER become an order item
--        (test 19.1);
--   * a product line references a real product row.
-- Enforced on UPDATE as well so staff cannot re-point rows after the fact.
-- ---------------------------------------------------------------------------
create or replace function public.validate_order_item_lineage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent   record;
  v_service  record;
  v_product  record;
begin
  if new.item_kind = 'service_addon' then
    select o.* into v_parent
    from public.order_items o
    where o.id = new.parent_order_item_id;

    if not found then
      raise exception 'Add-on items must reference an existing parent line'
        using errcode = '23503';
    end if;

    if v_parent.order_id <> new.order_id then
      raise exception 'Add-on parent must belong to the same order'
        using errcode = '23503';
    end if;

    if v_parent.item_kind <> 'product' then
      raise exception 'Add-ons may only attach to product lines'
        using errcode = '23514';
    end if;

    select s.* into v_service
    from public.services s
    where s.id = new.service_id;

    if not found then
      raise exception 'Add-on references an unknown service'
        using errcode = '23503';
    end if;

    if v_service.kind <> 'add_on' then
      raise exception 'Only add-on services may appear as order items'
        using errcode = '23514';
    end if;
  else
    -- product line
    if new.parent_order_item_id is not null then
      raise exception 'Product lines cannot have parents'
        using errcode = '23514';
    end if;

    select p.* into v_product
    from public.products p
    where p.id = new.product_id;

    if not found then
      raise exception 'Order item references an unknown product'
        using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

create trigger order_items_validate_lineage
before insert or update on public.order_items
for each row execute function public.validate_order_item_lineage();

-- ---------------------------------------------------------------------------
-- 4.9 booking-service guard: service_requests must reference a BOOKING
-- service (never an add-on) — the mirror-image protection that keeps the
-- two domains separated at the database boundary.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_booking_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.services s
    where s.id = new.service_id
      and s.kind = 'booking'
  ) then
    raise exception 'Only booking services may create service requests';
  end if;

  return new;
end;
$$;

create trigger service_request_service_guard
before insert or update on public.service_requests
for each row
execute function public.ensure_booking_service();

-- ---------------------------------------------------------------------------
-- Daily business reference generator.
-- next_daily_ref('order')       -> CV-ORD-20260918-0001
-- next_daily_ref('service_req')  -> SR-20260918-0001
-- Atomic upsert so concurrent callers never collide on last_value.
-- ---------------------------------------------------------------------------
create or replace function public.next_daily_ref(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Africa/Lagos')::date;
  v_value  bigint;
  v_prefix text;
begin
  v_prefix := case p_kind
    when 'order' then 'CV-ORD'
    when 'service_req' then 'SR'
    else 'REF'
  end;

  insert into public.daily_sequences as ds (seq_date, kind, last_value)
  values (v_today, p_kind, 1)
  on conflict (seq_date, kind)
    do update set last_value = ds.last_value + 1
    returning ds.last_value into v_value;

  return v_prefix || '-' || to_char(v_today, 'YYYYMMDD') || '-' ||
         lpad(v_value::text, 4, '0');
end;
$$;

-- request_number default for service_requests (API inserts stay unnumbered;
-- the database assigns the human reference).
create or replace function public.assign_request_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_number is null or new.request_number = '' then
    new.request_number := public.next_daily_ref('service_req');
  end if;
  return new;
end;
$$;

create trigger service_requests_assign_number
before insert on public.service_requests
for each row execute function public.assign_request_number();

-- ############################################################################
-- ## 0003_rls.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0003_rls
-- Row-Level Security. Blueprint §5, reproduced in full, plus hardening notes.
--
-- Design: customers own reads; staff/admin (via public.users.role, never
-- via JWT directly) get full write. There is deliberately NO customer INSERT
-- policy on orders/order_items/currency_quotes/payment_events: those rows are
-- created exclusively through SECURITY DEFINER RPCs that revalidate input.
-- service_requests is the only customer-facing insert (with status pinned to
-- 'requested' in WITH CHECK, so a booking cannot be self-approved).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 Staff helper (definer: avoids RLS recursion when evaluating policies
-- on public.users itself).
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('staff', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 5.2 Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;
alter table public.shipping_rate_cards enable row level security;
alter table public.currency_quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.service_requests enable row level security;
alter table public.payment_events enable row level security;
alter table public.order_events enable row level security;

-- Defense in depth: lock down the internal sequence bookkeeping table
-- entirely (even staff never read it directly). Supabase's default
-- privileges grant broad table rights to client roles and rely on RLS as
-- the boundary; we keep that model everywhere else (payment_events stays
-- grant-visible so its staff-read POLICY is the actual gate).
grant usage on schema public to anon, authenticated;
revoke all on public.daily_sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5.3 Users policies
-- ---------------------------------------------------------------------------
create policy users_read_own
on public.users
for select
 to authenticated
using (id = auth.uid());

create policy users_staff_all
on public.users
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy users_update_own_profile
on public.users
for update
 to authenticated
using (id = auth.uid())
with check (id = auth.uid());
-- Role mutation is further blocked by trigger protect_user_identity (0002).

-- ---------------------------------------------------------------------------
-- 5.4 Products policies — inactive rows only visible to staff.
-- ---------------------------------------------------------------------------
create policy products_public_read
on public.products
for select
 to anon, authenticated
using (is_active = true or public.is_staff());

create policy products_staff_write
on public.products
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.5 Services policies
-- ---------------------------------------------------------------------------
create policy services_public_read
on public.services
for select
 to anon, authenticated
using (is_active = true or public.is_staff());

create policy services_staff_write
on public.services
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.6 Shipping policies
-- ---------------------------------------------------------------------------
create policy shipping_rates_public_read
on public.shipping_rate_cards
for select
 to anon, authenticated
using (is_active = true or public.is_staff());

create policy shipping_rates_staff_write
on public.shipping_rate_cards
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.7 Currency quote policies — read-only for the owner; creation happens
-- inside SECURITY DEFINER create_quote (0005), so no customer insert policy.
-- ---------------------------------------------------------------------------
create policy currency_quotes_read_own
on public.currency_quotes
for select
 to authenticated
using (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.8 Orders policies — no customer direct-insert (checkout RPC only).
-- ---------------------------------------------------------------------------
create policy orders_read_own
on public.orders
for select
 to authenticated
using (
  user_id = auth.uid()
  or public.is_staff()
);

create policy orders_staff_write
on public.orders
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.9 Order item policies — visibility follows the parent order.
-- ---------------------------------------------------------------------------
create policy order_items_read_own
on public.order_items
for select
 to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (
        o.user_id = auth.uid()
        or public.is_staff()
      )
  )
);

create policy order_items_staff_write
on public.order_items
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.10 Service request policies — customers insert their OWN booking with
-- status pinned to 'requested'; updates/deletes are staff-only, so a
-- customer can never advance their own booking to 'scheduled'.
-- ---------------------------------------------------------------------------
create policy service_requests_read_own
on public.service_requests
for select
 to authenticated
using (
  user_id = auth.uid()
  or public.is_staff()
);

create policy service_requests_create_own
on public.service_requests
for insert
 to authenticated
with check (
  user_id = auth.uid()
  and status = 'requested'
);

create policy service_requests_staff_write
on public.service_requests
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5.11 Payment and order event policies — payment_events is staff-read only
-- (raw provider payloads contain payer data; customers never see them).
-- ---------------------------------------------------------------------------
create policy payment_events_staff_read
on public.payment_events
for select
 to authenticated
using (public.is_staff());

create policy order_events_read_own
on public.order_events
for select
 to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_events.order_id
      and (
        o.user_id = auth.uid()
        or public.is_staff()
      )
  )
);

create policy order_events_staff_write
on public.order_events
for all
 to authenticated
using (public.is_staff())
with check (public.is_staff());

-- ############################################################################
-- ## 0004_helpers.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0004_helpers
-- Canonical hashing, shipping zone resolution, money conversion helpers used
-- by the checkout RPCs. These live in the database (not only in TypeScript)
-- so the quote hash a customer must replay is computed by the SAME code path
-- that validated it. Blueprint §12.1, §12.3.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Deterministic money conversion.
--   * NGN (base) is the identity — returns the amount unchanged.
--   * A missing/invalid rate raises. We NEVER silently fall back to 1.0
--     (test 19.2: "Missing rates do not silently use a rate of one").
--   * Rounding is round-half-away-from-zero at minor-unit granularity via
--     numeric round(); inputs are non-negative so this equals round-half-up.
-- ---------------------------------------------------------------------------
create or replace function public.convert_minor(
  p_amount_base_minor bigint,
  p_rate numeric
)
returns bigint
language plpgsql
immutable
as $$
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'FX rate missing or non-positive'
      using errcode = '22012';
  end if;

  return round(p_amount_base_minor * p_rate)::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canonical cart hash.
-- The client sends line payloads; we hash a CANONICAL projection of them:
--   kind, catalog id, quantity, parent linkage — sorted by the canonical
--   rendering itself (not by client-chosen ids), so reordering the array or
--   renaming client line ids cannot smuggle different content through the
--   same hash. Prices are deliberately NOT in the hash: price movement must
--   be caught by the server re-pricing check in create_order_from_quote,
--   not silently accepted as "same cart".
-- ---------------------------------------------------------------------------
create or replace function public.cart_hash(
  p_lines jsonb,
  p_display_currency public.currency_code,
  p_zone_code text
)
returns text
language sql
immutable
as $$
  select encode(
    digest(
      coalesce(
        (
          select string_agg(item, E'\n' order by item)
          from (
            select jsonb_build_object(
                     'k',  l ->> 'kind',
                     'id', coalesce(l ->> 'productId', l ->> 'serviceId'),
                     'q',  (l ->> 'quantity')::int,
                     -- accept both spellings; the canonical hash is over the
                     -- normalized projection, so key naming drift on the
                     -- client cannot desync quote vs. order-time hashes.
                     'p',  coalesce(l ->> 'parentClientLineId', l ->> 'parentLineId')
                   )::text as item
            from jsonb_array_elements(p_lines) as l
          ) projected
        ),
        ''
      )
      || '|' || p_display_currency::text
      || '|' || p_zone_code,
      'sha256'
    ),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Canonical address normalization + hash. Trims whitespace, folds case,
-- so "Lagos State"/"lagos state" quote and checkout to the same zone/hash.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_shipping_address(p_address jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'country',     upper(trim(coalesce(p_address ->> 'country', ''))),
    'state',       trim(coalesce(p_address ->> 'state', '')),
    'city',        trim(coalesce(p_address ->> 'city', '')),
    'addressLine1', trim(coalesce(p_address ->> 'addressLine1', '')),
    'addressLine2', trim(coalesce(p_address ->> 'addressLine2', '')),
    'postalCode',  trim(coalesce(p_address ->> 'postalCode', ''))
  );
$$;

create or replace function public.address_hash(p_address jsonb)
returns text
language sql
immutable
as $$
  select encode(
    digest(public.normalize_shipping_address(p_address)::text, 'sha256'),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Shipping zone resolver (§12.3 step 2). Country + Nigerian state, with a
-- Lagos mainland/island split by city keyword. Unknown NG states fall into
-- 'ng-other'; everything outside Nigeria is 'intl' (charged intl rates).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_shipping_zone(p_address jsonb)
returns text
language sql
immutable
as $$
  select case
    when v.country <> 'NG' then 'intl'
    when v.state = 'lagos' then
      case
        when v.city in ('vi', 'v.i') or v.city ~ '(lekki|ikoyi|victoria island|ajah|ibefun|orile|onyi)'
          then 'lagos-island'
        else 'lagos-mainland'
      end
    when v.state in ('abuja', 'fct', 'f c t', 'federal capital territory') then 'abuja'
    when v.state in ('ogun','oyo','osun','ondo','ekiti') then 'south-west'
    when v.state in ('anambra','imo','abia','enugu','ebonyi') then 'south-east'
    when v.state in ('rivers','akwa ibom','cross river','bayelsa','delta','edo') then 'south-south'
    when v.state in ('kaduna','kano','katsina','sokoto','zamfara','kebbi','niger','bauchi','yobe','jigawa','borno','adamawa','gombe','taraba','nasarawa','plateau','benue') then 'north'
    else 'ng-other'
  end
  from (
    select
      upper(trim(coalesce(p_address ->> 'country', 'NG'))) as country,
      lower(regexp_replace(trim(coalesce(p_address ->> 'state', '')), '\s+state$', '', 'g')) as state,
      lower(trim(coalesce(p_address ->> 'city', ''))) as city
  ) v;
$$;

-- ---------------------------------------------------------------------------
-- Shipping cost in NGN minor units for a set of lines (§12.3 steps 3–5).
-- Rules (documented deviation, deterministic):
--   * Only lines whose catalog row is shippable contribute.
--   * The billable amount is the MAX rate card across distinct shipping
--     classes present (consolidated shipment — a single truck, most
--     expensive class sets the price). Free pickup-only carts cost 0.
--   * Missing zone+class card falls back to zone+'standard'; if even that
--     is absent, the quote fails loudly instead of shipping for free.
-- ---------------------------------------------------------------------------
create or replace function public.shipping_base_minor(
  p_zone_code text,
  p_lines jsonb
)
returns bigint
language plpgsql
stable
as $$
declare
  v_product_ids uuid[];
  v_max         bigint;
  v_found       text;
begin
  select coalesce(array_agg(distinct (l ->> 'productId')::uuid), '{}')
    into v_product_ids
  from jsonb_array_elements(p_lines) l
  where l ->> 'kind' = 'product';

  if coalesce(array_length(v_product_ids, 1), 0) = 0 then
    return 0;  -- add-on-only carts should never reach here; treat as free
  end if;

  -- Distinct shipping classes present in this cart, products only
  -- (services are non-shippable in this build; the join filters them out).
  with classes as (
    select distinct p.shipping_class
    from public.products p
    where p.id = any (v_product_ids)
  )
  select max(c.amount_minor), min(c.zone_code)
    into v_max, v_found
  from classes k
  join lateral (
    select coalesce(
             (select s.amount_minor
              from public.shipping_rate_cards s
              where s.zone_code = p_zone_code
                and s.shipping_class = k.shipping_class
                and s.is_active),
             (select s.amount_minor
              from public.shipping_rate_cards s
              where s.zone_code = p_zone_code
                and s.shipping_class = 'standard'
                and s.is_active)
           ) as amount_minor,
           p_zone_code as zone_code
  ) c on true;

  if v_max is null or v_found is null then
    raise exception 'No shipping rate card for zone %', p_zone_code
      using errcode = 'P0001';
  end if;

  return v_max;
end;
$$;

-- ############################################################################
-- ## 0005_checkout.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0005_checkout
-- Server-authoritative quote + atomic order creation. Blueprint §12, §15.4,
-- §21.1 (items 1,2,3,6,7). SECURITY DEFINER because customers have no
-- direct INSERT policies on currency_quotes / orders / order_items (§5.7-§5.9);
-- the functions themselves re-derive every amount from the catalog, so the
-- client can only ever send ids and quantities.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Structural validation shared by create_quote / create_order_from_quote.
-- Returns the number of lines that FAIL the payload contract. All casts are
-- regex-guarded first (CASE WHEN guarantees evaluation order) so malformed
-- JSON raises our clean error, not a raw cast exception.
-- ---------------------------------------------------------------------------
create or replace function public.count_invalid_lines(p_lines jsonb)
returns integer
language sql
stable
as $$
  select coalesce(count(*), 1)::int
  from (
    select
      l,
      jsonb_typeof(p_lines) = 'array' as is_array,
      (l ->> 'kind') in ('product', 'service_addon') as kind_ok,
      coalesce(l ->> 'quantity', '') ~ '^[1-9][0-9]{0,2}$' as qty_ok,  -- 1..999
      case
        when l ->> 'kind' = 'product'
          then (l ->> 'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        else (l ->> 'serviceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and coalesce(l ->> 'parentClientLineId', '') <> ''
      end as ids_ok,
      coalesce(l ->> 'clientLineId', '') <> '' as client_id_ok
    from jsonb_array_elements(
      case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end
    ) as l
  ) checked
  where not (is_array and kind_ok and qty_ok and ids_ok and client_id_ok)
$$;

-- ---------------------------------------------------------------------------
-- 12.1 create_quote
-- Steps 1-15 of the quote endpoint responsibilities, executed server-side:
-- authenticate, validate ids/quantities, load ACTIVE catalog rows, enforce
-- parent/child + kind rules, validate nothing references booking services,
-- resolve zone, compute NGN subtotal + shipping, apply frozen rates, persist
-- a short-lived currency_quotes row, return it.
-- ---------------------------------------------------------------------------
create or replace function public.create_quote(
  p_lines jsonb,
  p_address jsonb,
  p_display_currency public.currency_code,
  p_charge_currency public.currency_code,
  p_base_to_display numeric,
  p_base_to_charge numeric,
  p_rate_provider text,
  p_ttl_seconds integer default 600
)
returns table (
  quote_id                uuid,
  zone_code               text,
  display_currency        public.currency_code,
  charge_currency         public.currency_code,
  subtotal_base_minor     bigint,
  shipping_base_minor     bigint,
  total_base_minor        bigint,
  subtotal_display_minor  bigint,
  shipping_display_minor  bigint,
  total_display_minor     bigint,
  subtotal_charge_minor   bigint,
  shipping_charge_minor   bigint,
  total_charge_minor      bigint,
  expires_at              timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_line_count    int;
  v_product_lines int;
  v_addon_lines   int;
  v_found_products int;
  v_found_services int;
  v_found_addons   int;
  v_bad           int;
  v_zone          text;
  v_subtotal_base bigint := 0;
  v_ship_base     bigint := 0;
  v_rate_display  numeric;
  v_rate_charge   numeric;
  v_quote         currency_quotes;
  v_ttl           int;
begin
  -- (1) Customer authenticated.
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- (3) Structural validation of ids/quantities (regex-guarded, see
  -- count_invalid_lines).
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array';
  end if;

  v_line_count := jsonb_array_length(p_lines);
  if v_line_count < 1 or v_line_count > 100 then
    raise exception 'Cart must contain between 1 and 100 lines';
  end if;

  v_bad := public.count_invalid_lines(p_lines);
  if v_bad > 0 then
    raise exception 'Malformed checkout line payload (% issue(s))', v_bad;
  end if;

  -- Duplicate client line ids would corrupt parent wiring.
  select count(*) into v_bad
  from (
    select l ->> 'clientLineId' as cid
    from jsonb_array_elements(p_lines) l
    group by 1 having count(*) > 1
  ) dup;
  if v_bad > 0 then
    raise exception 'Duplicate clientLineId in cart';
  end if;

  -- One line per product id (the storefront store aggregates quantities on
  -- addProduct; rejecting here keeps quote and order-time hashing aligned
  -- with an unambiguous add-on parent map).
  select count(*)::int into v_bad
  from (
    select (l ->> 'productId')::uuid as pid
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'product'
    group by 1
    having count(*) > 1
  ) dup;
  if v_bad > 0 then
    raise exception 'Cart must aggregate quantity per product before checkout';
  end if;

  -- (4)(5) Catalog loads + parent/child + kind enforcement.
  select count(*) filter (where l ->> 'kind' = 'product')::int,
         count(*) filter (where l ->> 'kind' = 'service_addon')::int
    into v_product_lines, v_addon_lines
  from jsonb_array_elements(p_lines) l;

  if v_product_lines = 0 then
    raise exception 'A cart needs at least one product line';
  end if;

  select count(*)::int into v_found_products
  from public.products p
  where p.is_active
    and p.id in (select (l ->> 'productId')::uuid
                 from jsonb_array_elements(p_lines) l
                 where l ->> 'kind' = 'product');

  if v_found_products <> v_product_lines then
    raise exception 'One or more products are unknown or inactive'
      using errcode = 'P0002';
  end if;

  if v_addon_lines > 0 then
    -- every requested service must exist, be active, and be an ADD_ON;
    -- booking services are reported separately for a precise client error.
    select count(*)::int,
           count(*) filter (where s.kind = 'add_on' and s.is_active)::int
      into v_found_services, v_found_addons
    from public.services s
    where s.id in (select (l ->> 'serviceId')::uuid
                   from jsonb_array_elements(p_lines) l
                   where l ->> 'kind' = 'service_addon');

    if v_found_services <> v_addon_lines then
      raise exception 'One or more add-on services are unknown'
        using errcode = 'P0002';
    end if;

    if v_found_addons <> v_addon_lines then
      raise exception 'Booking services cannot enter the cart; request them through the service platform'
        using errcode = 'P0001';
    end if;

    -- Add-on parent must be an existing product line's clientLineId.
    select count(*)::int into v_bad
    from jsonb_array_elements(p_lines) a
    where a ->> 'kind' = 'service_addon'
      and not exists (
        select 1
        from jsonb_array_elements(p_lines) p
        where p ->> 'kind' = 'product'
          and p ->> 'clientLineId' = a ->> 'parentClientLineId'
      );
    if v_bad > 0 then
      raise exception 'Every add-on must belong to a product line';
    end if;
  end if;

  -- (8) Base NGN subtotal from catalog prices (client amounts never read).
  select coalesce(sum(qty * unit_price), 0)::bigint
    into v_subtotal_base
  from (
    select (l ->> 'quantity')::int as qty, p.unit_price_minor as unit_price
    from jsonb_array_elements(p_lines) l
    join public.products p on p.id = (l ->> 'productId')::uuid
    where l ->> 'kind' = 'product'
    union all
    select (l ->> 'quantity')::int, s.base_price_minor
    from jsonb_array_elements(p_lines) l
    join public.services s on s.id = (l ->> 'serviceId')::uuid
    where l ->> 'kind' = 'service_addon'
  ) priced;

  -- (2)(7) Address validation happens in the route schema; here we derive
  -- the zone and shipping from the rate cards.
  v_zone := public.resolve_shipping_zone(p_address);

  -- (6) Inventory sanity at quote time (authoritative check is at order
  -- creation, under row locks).
  select count(*)::int into v_bad
  from (
    select (l ->> 'productId')::uuid as pid, sum((l ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'product'
    group by 1
  ) want
  join public.products p on p.id = want.pid
  where want.qty > p.inventory_qty;
  if v_bad > 0 then
    raise exception 'Insufficient stock for one or more products';
  end if;

  v_ship_base := public.shipping_base_minor(v_zone, p_lines);

  -- (10)(11)(12) Currency resolution + frozen rates.
  if p_charge_currency not in ('NGN', 'USD') then
    raise exception 'Charge currency % is not supported by the configured Paystack account',
      p_charge_currency;
  end if;

  v_ttl := least(greatest(coalesce(p_ttl_seconds, 600), 60), 900);

  v_rate_display := case when p_display_currency = 'NGN' then 1
                         else coalesce(p_base_to_display, 0) end;
  v_rate_charge  := case when p_charge_currency  = 'NGN' then 1
                         else coalesce(p_base_to_charge, 0) end;

  -- (13) Minor-unit rounding, deterministic (convert_minor raises on bad rate).
  insert into public.currency_quotes (
    user_id,
    base_currency,
    display_currency,
    charge_currency,
    base_to_display_rate,
    base_to_charge_rate,
    zone_code,
    subtotal_base_minor,
    shipping_base_minor,
    total_base_minor,
    subtotal_display_minor,
    shipping_display_minor,
    total_display_minor,
    subtotal_charge_minor,
    shipping_charge_minor,
    total_charge_minor,
    cart_hash,
    shipping_address_hash,
    rate_provider,
    expires_at
  )
  values (
    v_user,
    'NGN',
    p_display_currency,
    p_charge_currency,
    v_rate_display,
    v_rate_charge,
    v_zone,
    v_subtotal_base,
    v_ship_base,
    v_subtotal_base + v_ship_base,
    public.convert_minor(v_subtotal_base, v_rate_display),
    public.convert_minor(v_ship_base, v_rate_display),
    public.convert_minor(v_subtotal_base, v_rate_display)
      + public.convert_minor(v_ship_base, v_rate_display),
    public.convert_minor(v_subtotal_base, v_rate_charge),
    public.convert_minor(v_ship_base, v_rate_charge),
    public.convert_minor(v_subtotal_base, v_rate_charge)
      + public.convert_minor(v_ship_base, v_rate_charge),
    public.cart_hash(p_lines, p_display_currency, v_zone),
    public.address_hash(p_address),
    coalesce(nullif(trim(p_rate_provider), ''), 'manual'),
    now() + make_interval(secs => v_ttl)
  )
  returning * into v_quote;

  -- (14)(15) Return the persisted quote.
  return query select
    v_quote.id,
    v_quote.zone_code,
    v_quote.display_currency,
    v_quote.charge_currency,
    v_quote.subtotal_base_minor,
    v_quote.shipping_base_minor,
    v_quote.total_base_minor,
    v_quote.subtotal_display_minor,
    v_quote.shipping_display_minor,
    v_quote.total_display_minor,
    v_quote.subtotal_charge_minor,
    v_quote.shipping_charge_minor,
    v_quote.total_charge_minor,
    v_quote.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15.4 create_order_from_quote
-- Creates orders + order_items ATOMICALLY before Paystack opens. Re-checks:
-- ownership, expiry, cart hash, address hash, live prices, live shipping,
-- inventory (with reserved decrement). Idempotent per (user, idempotency
-- key); one quote can fund exactly one order (orders_quote_id_key).
-- ---------------------------------------------------------------------------
create or replace function public.create_order_from_quote(
  p_quote_id uuid,
  p_lines jsonb,
  p_shipping_address jsonb,
  p_idempotency_key text
)
returns table (
  order_id          uuid,
  order_number      text,
  payment_reference text,
  display_currency  public.currency_code,
  charge_currency   public.currency_code,
  total_display_minor bigint,
  total_charge_minor  bigint,
  reused            boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_quote         currency_quotes;
  v_existing      orders;
  v_order         orders;
  v_parent_map    jsonb;
  v_subtotal      bigint;
  v_ship          bigint;
  v_items_base    bigint;
  v_ref           text;
  v_number        text;
  v_email         text;
  v_bad           int;
  v_attempt       int;
  v_locked        boolean := false;
  v_reserve_pids  uuid[];
  v_reserve_qtys  int[];
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or public.count_invalid_lines(p_lines) > 0 then
    raise exception 'Malformed checkout line payload';
  end if;

  -- Idempotent replay of initialization (blueprint §18.4).
  if coalesce(p_idempotency_key, '') <> '' then
    select o.* into v_existing
    from public.orders o
    where o.user_id = v_user
      and o.metadata ->> 'idempotency_key' = p_idempotency_key;

    if found then
      return query select
        v_existing.id,
        v_existing.order_number,
        v_existing.payment_reference,
        v_existing.display_currency,
        v_existing.charge_currency,
        v_existing.total_display_minor,
        v_existing.total_charge_minor,
        true;
      return;
    end if;
  end if;

  -- Lock the quote; ownership enforced here (no customer quote insert/update
  -- policy exists, and the FK chain makes leaked ids useless).
  select q.* into v_quote
  from public.currency_quotes q
  where q.id = p_quote_id
    and q.user_id = v_user
  for update;

  if not found then
    raise exception 'Quote not found for this customer' using errcode = 'P0002';
  end if;

  if v_quote.expires_at <= now() then
    raise exception 'Quote expired; request a new one' using errcode = 'P0001';
  end if;

  -- Cart/address must be identical to what was quoted (test 19.2).
  if public.cart_hash(p_lines, v_quote.display_currency, v_quote.zone_code)
     <> v_quote.cart_hash then
    raise exception 'Cart changed after quoting; re-quote required'
      using errcode = 'P0001';
  end if;

  if public.address_hash(p_shipping_address) <> v_quote.shipping_address_hash then
    raise exception 'Address changed after quoting; re-quote required'
      using errcode = 'P0001';
  end if;

  if public.resolve_shipping_zone(p_shipping_address) <> v_quote.zone_code then
    raise exception 'Shipping zone changed after quoting';
  end if;

  -- ── Lock products in deterministic id order (deadlock avoidance), then
  --    re-price from the catalog: authoritative, never from the browser.
  -- ──
  if not v_locked then
    perform 1
    from public.products p
    where p.id in (select (l ->> 'productId')::uuid
                   from jsonb_array_elements(p_lines) l
                   where l ->> 'kind' = 'product')
    order by p.id
    for update;
    v_locked := true;
  end if;

  select count(*)::int into v_bad
  from public.products p
  where p.id in (select (l ->> 'productId')::uuid
                 from jsonb_array_elements(p_lines) l
                 where l ->> 'kind' = 'product')
    and not p.is_active;
  if v_bad > 0 then
    raise exception 'A product in the cart became unavailable' using errcode = 'P0001';
  end if;

  select coalesce(sum(qty * unit_price), 0)::bigint into v_subtotal
  from (
    select (l ->> 'quantity')::int as qty, p.unit_price_minor as unit_price
    from jsonb_array_elements(p_lines) l
    join public.products p on p.id = (l ->> 'productId')::uuid
    where l ->> 'kind' = 'product'
    union all
    select (l ->> 'quantity')::int, s.base_price_minor
    from jsonb_array_elements(p_lines) l
    join public.services s on s.id = (l ->> 'serviceId')::uuid
    where l ->> 'kind' = 'service_addon'
  ) priced;

  if v_subtotal <> v_quote.subtotal_base_minor then
    raise exception 'Prices changed after quoting; re-quote required'
      using errcode = 'P0001';
  end if;

  v_ship := public.shipping_base_minor(v_quote.zone_code, p_lines);
  if v_ship <> v_quote.shipping_base_minor then
    raise exception 'Shipping changed after quoting; re-quote required'
      using errcode = 'P0001';
  end if;

  -- ── Inventory check + reservation under the row locks held above.
  --    Aggregated per product with plain arrays (no temp tables inside a
  --    SECURITY DEFINER function — avoids pg_temp surprises). One line per
  --    product id is required so the add-on parent map is unambiguous;
  --    duplicate client lines are rejected loudly instead of merged.
  -- ──
  select count(*)::int into v_bad
  from (
    select (l ->> 'productId')::uuid as pid
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'product'
    group by 1
    having count(*) > 1
  ) dup;
  if v_bad > 0 then
    raise exception 'Cart must aggregate quantity per product before checkout';
  end if;

  select
    array_agg(want.pid),
    array_agg(want.qty)
  into v_reserve_pids, v_reserve_qtys
  from (
    select (l ->> 'productId')::uuid as pid, sum((l ->> 'quantity')::int) as qty
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'product'
    group by 1
  ) want;

  select count(*)::int into v_bad
  from unnest(v_reserve_pids, v_reserve_qtys) as r(pid, qty)
  join public.products p on p.id = r.pid
  where r.qty > p.inventory_qty;
  if v_bad > 0 then
    raise exception 'Insufficient stock for one or more products'
      using errcode = 'P0001';
  end if;

  update public.products p
     set inventory_qty = p.inventory_qty - r.qty
  from unnest(v_reserve_pids, v_reserve_qtys) as r(pid, qty)
  where p.id = r.pid;

  -- ── Order header. Totals come from the QUOTE row (frozen at quote time);
  --    the checks above proved the quote still matches reality.
  -- ──
  select coalesce(u.email, '') into v_email
  from public.users u where u.id = v_user;

  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    -- Both human references are regenerated on retry: a unique_violation can
    -- come from either column, and reusing the value would spin uselessly.
    v_number := public.next_daily_ref('order');
    v_ref := 'CV-'
      || to_char(now() at time zone 'Africa/Lagos', 'YYYYMMDD')
      || '-'
      || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    begin
      insert into public.orders (
        order_number,
        payment_reference,
        user_id,
        quote_id,
        status,
        payment_status,
        base_currency,
        display_currency,
        charge_currency,
        fx_rate_base_to_display,
        fx_rate_base_to_charge,
        subtotal_base_minor,
        shipping_base_minor,
        total_base_minor,
        subtotal_display_minor,
        shipping_display_minor,
        total_display_minor,
        subtotal_charge_minor,
        shipping_charge_minor,
        total_charge_minor,
        shipping_zone,
        shipping_address,
        customer_email_snapshot,
        metadata
      ) values (
        v_number,
        v_ref,
        v_user,
        v_quote.id,
        'pending_payment',
        'pending',
        'NGN',
        v_quote.display_currency,
        v_quote.charge_currency,
        v_quote.base_to_display_rate,
        v_quote.base_to_charge_rate,
        v_quote.subtotal_base_minor,
        v_quote.shipping_base_minor,
        v_quote.total_base_minor,
        v_quote.subtotal_display_minor,
        v_quote.shipping_display_minor,
        v_quote.total_display_minor,
        v_quote.subtotal_charge_minor,
        v_quote.shipping_charge_minor,
        v_quote.total_charge_minor,
        v_quote.zone_code,
        public.normalize_shipping_address(p_shipping_address),
        v_email,
        jsonb_strip_nulls(jsonb_build_object(
          'idempotency_key',
          nullif(coalesce(p_idempotency_key, ''), '')
        ))
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  -- ── Order items with catalog-sourced snapshots (§2.2). Products first,
  --    capturing the clientLineId -> order_item.id map, then add-ons joined
  --    to their parents (test 19.1: parent from another order impossible).
  -- ──
  with qty as (
    select (l ->> 'productId')::uuid as product_id,
           sum((l ->> 'quantity')::int) as quantity,
           min(l ->> 'clientLineId') as client_line_id
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'product'
    group by 1
  ),
  ins as (
    insert into public.order_items (
      order_id, item_kind, product_id, quantity,
      name_snapshot, sku_snapshot,
      unit_price_base_minor, unit_price_display_minor, unit_price_charge_minor,
      metadata
    )
    select v_order.id, 'product', q.product_id, q.quantity,
           p.name, p.sku,
           p.unit_price_minor,
           public.convert_minor(p.unit_price_minor, v_quote.base_to_display_rate),
           public.convert_minor(p.unit_price_minor, v_quote.base_to_charge_rate),
           jsonb_build_object('clientLineId', q.client_line_id)
    from qty q
    join public.products p on p.id = q.product_id
    returning id, metadata ->> 'clientLineId' as client_line_id
  )
  select jsonb_object_agg(
           coalesce(client_line_id, ''), id::text
         )
    into v_parent_map
  from ins;

  insert into public.order_items (
    order_id, item_kind, service_id, parent_order_item_id, quantity,
    name_snapshot,
    unit_price_base_minor, unit_price_display_minor, unit_price_charge_minor,
    metadata
  )
  select v_order.id, 'service_addon', a.service_id,
         (v_parent_map ->> a.parent_client_line_id)::uuid,
         a.quantity,
         s.name,
         s.base_price_minor,
         public.convert_minor(s.base_price_minor, v_quote.base_to_display_rate),
         public.convert_minor(s.base_price_minor, v_quote.base_to_charge_rate),
         jsonb_build_object(
           'clientLineId', a.client_line_id,
           'parentClientLineId', a.parent_client_line_id
         )
  from (
    select (l ->> 'serviceId')::uuid as service_id,
           min(l ->> 'parentClientLineId') as parent_client_line_id,
           min(l ->> 'clientLineId') as client_line_id,
           sum((l ->> 'quantity')::int) as quantity
    from jsonb_array_elements(p_lines) l
    where l ->> 'kind' = 'service_addon'
    group by 1
  ) a
  join public.services s on s.id = a.service_id;

  -- Post-insert invariant: line totals must equal the order subtotal
  -- (mirrors webhook step 7, enforced at creation too). The unqualified
  -- column must be table-qualified: it collides with the OUT parameter
  -- name order_id under plpgsql.variable_conflict = error.
  select coalesce(sum(oi.line_total_base_minor), 0)::bigint into v_items_base
  from public.order_items oi
  where oi.order_id = v_order.id;

  if v_items_base <> v_order.subtotal_base_minor then
    raise exception 'Internal total mismatch; order rolled back'
      using errcode = 'P0001';
  end if;

  insert into public.order_events (order_id, event_type, to_status, payload)
  values (
    v_order.id, 'created', 'pending_payment',
    jsonb_build_object(
      'quote_id', v_quote.id,
      'zone', v_quote.zone_code,
      'line_count', public.count_cart_lines(p_lines)
    )
  );

  return query select
    v_order.id,
    v_order.order_number,
    v_order.payment_reference,
    v_order.display_currency,
    v_order.charge_currency,
    v_order.total_display_minor,
    v_order.total_charge_minor,
    false;
end;
$$;

-- Small helper used in the order_events payload above (line counter that
-- tolerates non-array input; every real path is validated before this runs).
create or replace function public.count_cart_lines(p_lines jsonb)
returns int
language sql
stable
as $$
  select case when jsonb_typeof(p_lines) = 'array'
              then jsonb_array_length(p_lines)::int
              else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: customers may call checkout functions; the service role calls them
-- through admin clients as needed. Public gets nothing.
-- ---------------------------------------------------------------------------
revoke all on function public.create_quote(jsonb, jsonb, public.currency_code, public.currency_code, numeric, numeric, text, integer) from public;
revoke all on function public.create_order_from_quote(uuid, jsonb, jsonb, text) from public;
grant execute on function public.create_quote(jsonb, jsonb, public.currency_code, public.currency_code, numeric, numeric, text, integer) to authenticated;
grant execute on function public.create_order_from_quote(uuid, jsonb, jsonb, text) to authenticated;

-- ############################################################################
-- ## 0006_payments.sql
-- ############################################################################
-- ============================================================================
-- Chrisviscus Technologies — 0006_payments
-- Webhook journalling + shared order finalization. Blueprint §15.
--
-- Trust model (spec 3.3 / 18.2 / 21.1 item 4):
--   * The webhook route verifies the RAW BODY HMAC before this file ever
--     sees parsed JSON, then calls process_paystack_event as service_role.
--   * Line items are NEVER reconstructed from provider payloads — the
--     order/order_items rows already exist (0005) and are only validated.
--   * Amount/currency/status must match the DATABASE order or the order
--     enters payment_review instead of fulfillment.
--   * Duplicate deliveries are no-ops via unique payment_events.event_key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Core finalization, shared by the webhook and the browser-recovery verify
-- route (both pass SERVER-verified data: webhook after HMAC + provider
-- fields; verify after api.paystack.co transaction verification).
-- Returns a machine-readable outcome for logs/tests:
--   paid | already_paid | mismatch | failed | pending | unlinked | ignored
-- ---------------------------------------------------------------------------
create or replace function public.finalize_paid_order(
  p_reference text,
  p_amount bigint,
  p_currency text,
  p_status text,
  p_transaction_id bigint,
  p_event_id uuid,
  p_source text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      orders;
  v_items      bigint;
  v_lines_sum  bigint;
  v_result     text;
  v_event_id   uuid := p_event_id;
begin
  -- Verify-route journaling: a synthetic, collision-free event row when the
  -- caller is the recovery path rather than the webhook.
  if v_event_id is null and coalesce(p_source, '') = 'verify' then
    insert into public.payment_events (
      provider, event_key, event_type, payment_reference,
      provider_amount_minor, provider_currency, provider_status,
      signature_verified, payload
    )
    values (
      'paystack',
      'verify:' || p_reference || ':' || coalesce(p_transaction_id::text, '0'),
      'server.verify',
      p_reference,
      p_amount, p_currency, p_status,
      true,  -- verified against api.paystack.co with the SECRET key
      jsonb_build_object('source', 'server-verify', 'reference', p_reference)
    )
    on conflict (event_key) do nothing
    returning id into v_event_id;
  end if;

  -- (2) Locate + (3) lock the order. Unmatched references are retained for
  -- the operations alert (processed_at stays NULL) and mark NOTHING paid.
  select o.* into v_order
  from public.orders o
  where o.payment_reference = p_reference
  for update;

  if not found then
    return 'unlinked';
  end if;

  if v_event_id is not null then
    update public.payment_events
       set order_id = v_order.id
     where id = v_event_id;
  end if;

  -- Already settled? (duplicate/late event protection — test 19.3)
  if v_order.payment_status = 'paid' then
    v_result := 'already_paid';
  elsif p_status = 'success' then
    -- (4)(5) Compare event amount/currency to the DATABASE order, never to
    -- browser state, and verify item integrity (spec 15.3 step 7).
    if p_amount is distinct from v_order.total_charge_minor
       or p_currency is distinct from v_order.charge_currency::text
    then
      v_result := 'mismatch';
    else
      select coalesce(sum(line_total_charge_minor), -1)::bigint
        into v_lines_sum
      from public.order_items
      where order_id = v_order.id;

      select count(*)::bigint into v_items
      from public.order_items
      where order_id = v_order.id;

      if v_items = 0 or v_lines_sum <> v_order.subtotal_charge_minor then
        v_result := 'integrity_mismatch';
      else
        v_result := 'paid';
      end if;
    end if;
  elsif p_status in ('failed', 'abandoned', 'invalid') then
    if v_order.status in ('pending_payment', 'payment_review') then
      v_result := 'failed';
    else
      -- A failed event must never overwrite a paid/shipped/cancelled order.
      v_result := 'ignored';
    end if;
  elsif p_status = 'pending' then
    v_result := 'pending';
  else
    v_result := 'ignored';
  end if;

  case v_result
    when 'paid' then
      update public.orders
         set payment_status = 'paid',
             status = 'paid',
             paid_at = now(),
             paystack_transaction_id = coalesce(p_transaction_id, paystack_transaction_id)
       where id = v_order.id;

      insert into public.order_events (order_id, event_type, from_status, to_status, payload)
      values (
        v_order.id, 'payment_paid', v_order.status, 'paid',
        jsonb_build_object(
          'reference', p_reference,
          'source', coalesce(p_source, 'webhook'),
          'transaction_id', p_transaction_id
        )
      );

    when 'mismatch' then
      update public.orders
         set payment_status = 'failed',
             status = 'payment_review'
       where id = v_order.id
         and status not in ('paid', 'refunded');

      insert into public.order_events (order_id, event_type, from_status, to_status, payload)
      values (
        v_order.id, 'payment_mismatch', v_order.status, 'payment_review',
        jsonb_build_object(
          'received_amount_minor', p_amount,
          'received_currency', p_currency,
          'expected_amount_minor', v_order.total_charge_minor,
          'expected_currency', v_order.charge_currency
        )
      );

    when 'integrity_mismatch' then
      update public.orders
         set status = 'payment_review'
       where id = v_order.id
         and status not in ('paid', 'refunded');

      insert into public.order_events (order_id, event_type, from_status, to_status, payload)
      values (
        v_order.id, 'payment_integrity_mismatch', v_order.status, 'payment_review',
        jsonb_build_object(
          'reference', p_reference,
          'items', v_items,
          'lines_sum', v_lines_sum,
          'subtotal_charge_minor', v_order.subtotal_charge_minor
        )
      );

    when 'failed' then
      update public.orders
         set payment_status = 'failed'
       where id = v_order.id;

      insert into public.order_events (order_id, event_type, from_status, payload)
      values (
        v_order.id, 'payment_failed', v_order.status,
        jsonb_build_object('reference', p_reference, 'provider_status', p_status)
      );

    else
      null;  -- already_paid / pending / ignored: journal only, no mutation
  end case;

  -- (8) Mark the event processed once it produced durable state knowledge.
  if v_event_id is not null and v_result <> 'pending' then
    update public.payment_events
       set processed_at = now()
     where id = v_event_id;
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhook entry point. The route has ALREADY verified the signature over the
-- raw body; the DB re-checks the claim, journals the event with idempotency,
-- then defers to the shared finalizer.
-- ---------------------------------------------------------------------------
create or replace function public.process_paystack_event(
  p_event_key text,
  p_event_type text,
  p_reference text,
  p_amount bigint,
  p_currency text,
  p_status text,
  p_payload jsonb,
  p_signature_verified boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_tx_id    bigint;
begin
  if p_event_key is null or length(p_event_key) < 8 or length(p_event_key) > 200 then
    raise exception 'Invalid event key' using errcode = '22023';
  end if;

  if coalesce(p_signature_verified, false) is not true then
    raise exception 'Refusing to process an unverified payment event'
      using errcode = '42501';
  end if;

  -- Provider transaction ids are attacker-influenced JSON in shape (we only
  -- trust the signature-verified body, but still): regex-guard before cast
  -- so a non-numeric id degrades to NULL instead of an exception that would
  -- roll back the journal insert and poison retries.
  v_tx_id := case
    when p_payload #>> '{data,id}' ~ '^[0-9]{1,18}$'
      then (p_payload #>> '{data,id}')::bigint
    else null
  end;

  -- (1) Journal. Unique event_key => duplicate deliveries return early and
  -- the route answers 200 (Paystack stops retrying) — test 19.3.
  insert into public.payment_events (
    provider, event_key, event_type, payment_reference,
    provider_amount_minor, provider_currency, provider_status,
    signature_verified, payload
  )
  values (
    'paystack', p_event_key, p_event_type, p_reference,
    p_amount, p_currency, p_status,
    true, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return 'duplicate';
  end if;

  return public.finalize_paid_order(
    p_reference, p_amount, p_currency, p_status,
    v_tx_id,
    v_event_id,
    'webhook'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 20.4 scheduled jobs (invoke via pg_cron or an authenticated cron route):
--   cancel_expired_unpaid_orders() — pending_payment past expires_at ->
--     'cancelled' + reserved inventory released (reservation is the only
--     stock mutation; there is no separate holds table by design).
--   purge_expired_quotes()        — stale currency_quotes not tied to an
--     order (orders.quote_id FK is RESTRICT, so referenced quotes never die).
--   archive_payment_event_payloads() — PII hygiene per §18.3.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_expired_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_order record;
begin
  for v_order in
    select o.id, o.order_number
    from public.orders o
    where o.status = 'pending_payment'
      and o.expires_at <= now()
    for update of o skip locked
  loop
    -- release reserved stock (product lines only)
    update public.products p
       set inventory_qty = p.inventory_qty + item.qty
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
      from public.order_items oi
      where oi.order_id = v_order.id
        and oi.item_kind = 'product'
      group by 1
    ) item
    where p.id = item.product_id;

    update public.orders
       set status = 'cancelled'
     where id = v_order.id;

    insert into public.order_events (order_id, event_type, from_status, to_status, payload)
    values (v_order.id, 'expired_unpaid', 'pending_payment', 'cancelled',
            jsonb_build_object('order_number', v_order.order_number));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.purge_expired_quotes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.currency_quotes q
    where q.expires_at < now() - interval '1 day'
      and not exists (select 1 from public.orders o where o.quote_id = q.id)
    returning 1
  )
  select count(*)::int into v_count from deleted;
  return v_count;
end;
$$;

create or replace function public.archive_payment_event_payloads(p_keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.payment_events
     set payload = jsonb_build_object(
           'archived', true,
           'event_type', event_type,
           'payment_reference', payment_reference
         )
   where processed_at is not null
     and created_at < now() - make_interval(days => greatest(coalesce(p_keep_days,90), 7));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the server-only admin client (service_role) may finalize.
-- Customers never call these directly — the routes do, with their own auth.
-- ---------------------------------------------------------------------------
revoke all on function public.finalize_paid_order(text, bigint, text, text, bigint, uuid, text) from public;
revoke all on function public.process_paystack_event(text, text, text, bigint, text, text, jsonb, boolean) from public;
revoke all on function public.cancel_expired_unpaid_orders() from public;
revoke all on function public.purge_expired_quotes() from public;
revoke all on function public.archive_payment_event_payloads(integer) from public;

grant execute on function public.finalize_paid_order(text, bigint, text, text, bigint, uuid, text) to service_role;
grant execute on function public.process_paystack_event(text, text, text, bigint, text, text, jsonb, boolean) to service_role;
grant execute on function public.cancel_expired_unpaid_orders() to service_role;
grant execute on function public.purge_expired_quotes() to service_role;
grant execute on function public.archive_payment_event_payloads(integer) to service_role;

-- ############################################################################
-- ## 0007_realtime_seed.sql
-- ############################################################################
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

-- ============================================================================
-- POST-INSTALL VERIFICATION (run each; expected results in comments)
-- ============================================================================

-- 1) All 11 core tables exist in the public schema:
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
-- expect exactly these 11 rows: currency_quotes, daily_sequences,
--   order_events, order_items, orders, payment_events, products,
--   service_requests, services, shipping_rate_cards, users

-- 2) RLS is enforced on every customer-facing table (must be 'true' for all rows):
select relname, relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relkind = 'r'
order by relname;

-- 3) Checkout RPCs are present:
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('create_quote','create_order_from_quote',
                  'finalize_paid_order','process_paystack_event',
                  'cancel_expired_unpaid_orders','purge_expired_quotes')
order by proname;
-- expect: all six rows

-- 4) Seed data landed (0007):
select count(*) as products from public.products;      -- expect: > 0
select count(*) as services from public.services;       -- expect: > 0
select count(*) as shipping from public.shipping_rate_cards; -- expect: > 0
