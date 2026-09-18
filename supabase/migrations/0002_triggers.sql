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
