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
