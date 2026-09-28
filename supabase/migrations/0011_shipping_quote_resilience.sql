-- ============================================================================
-- 0011_shipping_quote_resilience
-- Case/spacing tolerant Nigerian zone matching plus conservative rate-card
-- fallback tiers. Quote and checkout call these same functions, so totals and
-- address/zone integrity checks remain deterministic.
-- ============================================================================

create or replace function public.resolve_shipping_zone(p_address jsonb)
returns text
language sql
immutable
as $$
  select case
    when v.country <> 'NG' then 'intl'
    when v.state_key in ('lagos', 'lagos mainland', 'lagos island') then
      case
        when v.state_key = 'lagos island'
          or v.city_key in ('vi', 'v i')
          or v.city_key ~ '(lekki|ikoyi|victoria island|ajah|ibefun|orile|onyi)'
          then 'lagos-island'
        else 'lagos-mainland'
      end
    when v.state_key in ('abuja', 'fct', 'f c t', 'federal capital territory') then 'abuja'
    when v.state_key in ('ogun','oyo','osun','ondo','ekiti') then 'south-west'
    when v.state_key in ('anambra','imo','abia','enugu','ebonyi') then 'south-east'
    when v.state_key in ('rivers','akwa ibom','cross river','bayelsa','delta','edo') then 'south-south'
    when v.state_key in (
      'kaduna','kano','katsina','sokoto','zamfara','kebbi','niger','bauchi',
      'yobe','jigawa','borno','adamawa','gombe','taraba','nasarawa','plateau','benue'
    ) then 'north'
    else 'ng-other'
  end
  from (
    select
      upper(trim(coalesce(p_address ->> 'country', 'NG'))) as country,
      trim(regexp_replace(
        regexp_replace(lower(trim(coalesce(p_address ->> 'state', ''))), '[._-]+', ' ', 'g'),
        '\s+state$', '', 'g'
      )) as state_key,
      trim(regexp_replace(
        regexp_replace(lower(trim(coalesce(p_address ->> 'city', ''))), '[._-]+', ' ', 'g'),
        '\s+lga$', '', 'g'
      )) as city_key
  ) v;
$$;

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
    return 0;
  end if;

  with classes as (
    select distinct p.shipping_class
    from public.products p
    where p.id = any (v_product_ids)
  )
  select max(c.amount_minor), min(c.zone_code)
    into v_max, v_found
  from classes k
  join lateral (
    select s.amount_minor, s.zone_code
    from public.shipping_rate_cards s
    where s.is_active
      and (
        (s.zone_code = p_zone_code and s.shipping_class = k.shipping_class)
        or (s.zone_code = p_zone_code and s.shipping_class = 'standard')
        or (p_zone_code <> 'intl' and s.zone_code = 'ng-other' and s.shipping_class = k.shipping_class)
        or (p_zone_code <> 'intl' and s.zone_code = 'ng-other' and s.shipping_class = 'standard')
        or (s.zone_code = 'intl' and s.shipping_class = k.shipping_class)
        or (s.zone_code = 'intl' and s.shipping_class = 'standard')
      )
    order by case
      when s.zone_code = p_zone_code and s.shipping_class = k.shipping_class then 1
      when s.zone_code = p_zone_code and s.shipping_class = 'standard' then 2
      when s.zone_code = 'ng-other' and s.shipping_class = k.shipping_class then 3
      when s.zone_code = 'ng-other' and s.shipping_class = 'standard' then 4
      when s.zone_code = 'intl' and s.shipping_class = k.shipping_class then 5
      else 6
    end
    limit 1
  ) c on true;

  if v_max is null or v_found is null then
    raise exception 'No shipping rate card for zone % or fallback tiers', p_zone_code
      using errcode = 'P0001';
  end if;

  return v_max;
end;
$$;
