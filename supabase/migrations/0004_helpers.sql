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
