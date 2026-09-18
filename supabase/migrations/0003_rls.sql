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
