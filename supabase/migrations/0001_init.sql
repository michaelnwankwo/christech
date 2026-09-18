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
