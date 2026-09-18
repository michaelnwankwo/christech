-- ============================================================================
-- Chrisviscus Technologies — DB verification battery (tests §19.1-19.3 gates)
-- Run via scripts/db-verify.sh. Any failed assertion aborts (ON_ERROR_STOP).
-- ============================================================================
\set ON_ERROR_STOP on
set search_path to test, public;

-- ---------------------------------------------------------------------------
-- Fixture identities + catalog ids
-- ---------------------------------------------------------------------------
create table test.t_ids as
select
  '00000000-0000-0000-0000-00000000aaaa'::uuid as aid,
  '00000000-0000-0000-0000-00000000bbbb'::uuid as bid,
  '00000000-0000-0000-0000-00000000cccc'::uuid as sid,   -- staff
  '00000000-0000-0000-0000-00000000dddd'::uuid as admid; -- admin

create table test.t_cat as
select
  (select id from public.products  where sku  = 'HK-IPC-T124')                 as cam,
  (select id from public.products  where sku  = 'HK-NVR-7632')                 as nvr,
  (select unit_price_minor from public.products where sku = 'HK-IPC-T124')    as cam_price,
  (select base_price_minor from public.services where slug = 'addon-cctv-commissioning') as addon_price,
  (select id from public.services where slug = 'addon-cctv-commissioning')     as addon,
  (select id from public.services where slug = 'install-full-cctv-site')       as booking,
  (select inventory_qty from public.products where sku = 'HK-IPC-T124')        as cam_stock,
  (select amount_minor from public.shipping_rate_cards
     where zone_code='lagos-mainland' and shipping_class='standard')           as ship_lagos;

-- Running server-side expectation ledger: inventory/totals are tracked as
-- the script executes so assertions never depend on hand-computed numbers.
create table test.t_state as
select
  (select inventory_qty from public.products where sku = 'HK-IPC-T124') as stock_cam,
  0::bigint as orders,
  0::bigint as items,
  0::bigint as addons;

-- psql-side JSON payloads (single source of truth for line shapes)
select format(
  '[{"clientLineId":"c1","kind":"product","productId":"%s","quantity":2},
    {"clientLineId":"c2","kind":"service_addon","serviceId":"%s","parentClientLineId":"c1","quantity":1}]',
  (select cam from t_cat), (select addon from t_cat)) as lines_ok,
  '{"country":"NG","state":"Lagos","city":"Ikeja","addressLine1":"1 Test Road"}' as addr,
  format('[{"clientLineId":"c1","kind":"product","productId":"%s","quantity":2},
           {"clientLineId":"c2","kind":"service_addon","serviceId":"%s","parentClientLineId":"c1","quantity":1}]',
         (select cam from t_cat), (select booking from t_cat)) as lines_booking,
  format('[{"clientLineId":"c9","kind":"service_addon","serviceId":"%s","parentClientLineId":"nope","quantity":1},
           {"clientLineId":"c1","kind":"product","productId":"%s","quantity":1}]',
         (select addon from t_cat), (select cam from t_cat)) as lines_orphan,
  format('[{"clientLineId":"c1","kind":"product","productId":"%s","quantity":0}]',
         (select cam from t_cat)) as lines_badqty,
  '[{"clientLineId":"c1","kind":"product","productId":"00000000-0000-0000-0000-000000000bad","quantity":1}]' as lines_unknown,
  format('[{"clientLineId":"c1","kind":"product","productId":"%s","quantity":1}]',
         (select cam from t_cat)) as lines_one,
  format('[{"clientLineId":"c1","kind":"product","productId":"%s","quantity":3}]',
         (select cam from t_cat)) as lines_three,
  '{"country":"NG","state":"Lagos","city":"Lekki","addressLine1":"1 Test Road"}' as addr_island
\gset

-- ===========================================================================
-- A. Identity provisioning + users RLS + role guard                    (§19.1)
-- ===========================================================================
\echo '>> A. auth trigger, users RLS, role guard'

begin;
  select test.as_service();
  insert into auth.users (id, email) values
    ((select aid from t_ids), 'alice@example.com'),
    ((select bid from t_ids), 'bob@example.com'),
    ((select sid from t_ids), 'staff@example.com'),
    ((select admid from t_ids), 'admin@example.com');
commit;

do $$
declare c int;
begin
  select count(*) into c from public.users
   where id in ('00000000-0000-0000-0000-00000000aaaa'::uuid,
               '00000000-0000-0000-0000-00000000bbbb'::uuid,
               '00000000-0000-0000-0000-00000000cccc'::uuid,
               '00000000-0000-0000-0000-00000000dddd'::uuid);
  assert c = 4, format('FAIL: handle_new_auth_user created %s rows, expected 4', c);

  select count(*) into c from public.users where role = 'customer';
  assert c = 4, 'FAIL: all provisioned users must default to customer';
  raise notice 'ok: auth trigger provisions public.users with customer role';
end $$;

-- Staff assignment through the protected path (service_role)
begin;
  select test.as_service();
  update public.users set role = 'staff' where id = (select sid from t_ids);
commit;

-- Alice: sees only herself; cannot self-promote; cannot forge inserts;
-- cannot read payment events; cannot insert orders directly.
begin;
  select test.as_user((select aid from t_ids));

  create table test.t_seen as select count(*)::int as n from public.users;
  do $$
  declare c int; begin select n into c from t_seen;
    assert c = 1, format('FAIL: customer sees %s user rows, expected 1', c);
    raise notice 'ok: users_read_own exposes exactly one row';
  end $$;

  select test.expect_error(
    format('update public.users set role = ''admin'' where id = %L', (select aid from t_ids)::text),
    '%Only staff may change user roles%');

  select test.expect_error(
    format('insert into public.users (id) values (%L)', (select bid from t_ids)::text),
    '%row-level security%');

  -- role-frozen UPDATE via own-row policy must also fail at the trigger:
  select test.expect_error(
    format('insert into public.users (id, email, role) values (%L, ''x@x.com'', ''admin'')',
           (select bid from t_ids)::text),
    '%Privileged roles must be created through admin workflows%');

  select test.expect_error(
    format('insert into public.orders (order_number, payment_reference, user_id, quote_id,
             display_currency, charge_currency, fx_rate_base_to_display, fx_rate_base_to_charge,
             subtotal_base_minor, shipping_base_minor, total_base_minor,
             subtotal_display_minor, shipping_display_minor, total_display_minor,
             subtotal_charge_minor, shipping_charge_minor, total_charge_minor,
             shipping_zone, shipping_address, customer_email_snapshot)
            values (%L, %L, %L, gen_random_uuid(), ''NGN'', ''NGN'', 1, 1,
                    0,0,0, 0,0,0, 0,0,0, ''ng-other'', ''{}''::jsonb, ''a@x.com'')',
           'HACK-' || md5(random()::text), 'REF-' || md5(random()::text),
           (select aid from t_ids)::text),
    '%row-level security%');
commit;

begin;
  select test.as_user((select aid from t_ids));
  -- orders/order_items/currency_quotes/payment_events/daily_sequences probes
  create table test.t_leak as select
    (select count(*) from public.payment_events)  as pe,
    (select count(*) from public.orders)          as ords;
  do $$
  declare r record; begin select * into r from t_leak;
    assert r.pe = 0, 'FAIL: customer can see payment_events';
    assert r.ords = 0, 'FAIL: customer can see orders before any exist';
    raise notice 'ok: payment_events + orders invisible to empty customer';
  end $$;
commit;

-- daily_sequences table-level revoke
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error('select * from public.daily_sequences',
                           '%permission denied%');
commit;
\echo '   ok: daily_sequences denied at GRANT level'

-- Products visibility: inactive rows staff-only
begin;
  select test.as_service();
  update public.products set is_active = false where sku = 'HK-DS-1280';
commit;
begin;
  select test.as_anon();
  create table test.t_vis as select count(*)::int as n from public.products;
commit;
-- control count runs UNSWITCHED (superuser), else RLS skews the baseline
do $$
declare c int; base int; begin
  select n into c from t_vis;
  select count(*) into base from public.products;
  assert c = base - 1, format('FAIL: inactive product visible to anon (%s of %s)', c, base);
  raise notice 'ok: inactive products hidden from public readers';
end $$;
begin;
  select test.as_service();
  update public.products set is_active = true where sku = 'HK-DS-1280';
commit;

-- ===========================================================================
-- B. Quote creation + catalog authority                          (§12.1, §19.2)
-- ===========================================================================
\echo '>> B. create_quote'

-- NGN happy path — totals must equal server-computed math.
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q1 as select * from public.create_quote(
    :'lines_ok'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 'test-fx');
commit;

do $$
declare r record; sub bigint; ship bigint;
begin
  select subtotal_base_minor, shipping_base_minor, total_base_minor, zone_code into r from t_q1;
  select cam_price * 2 + addon_price into sub from t_cat;
  select ship_lagos into ship from t_cat;
  assert r.subtotal_base_minor = sub, format('FAIL subtotal %s vs %s', r.subtotal_base_minor, sub);
  assert r.shipping_base_minor = ship, 'FAIL shipping base';
  assert r.total_base_minor = sub + ship, 'FAIL total base';
  assert r.zone_code = 'lagos-mainland', 'FAIL zone resolution (Ikeja -> mainland)';
  raise notice 'ok: NGN quote math matches catalog (subtotal=%, shipping=%)', r.subtotal_base_minor, r.shipping_base_minor;
end $$;

-- USD display with frozen rate: deterministic half-up minor rounding.
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q_usd as
    select * from public.create_quote(:'lines_ok'::jsonb, :'addr'::jsonb,
                                      'USD', 'USD', 0.00065, 0.00065, 'test-fx');
commit;

do $$
declare r record;
begin
  select * into r from t_q_usd;
  assert r.total_display_minor = round((select total_base_minor from t_q1) * 0.00065), 'FAIL usd conversion';
  assert r.total_charge_minor = r.total_display_minor, 'FAIL charge snapshot';
  raise notice 'ok: USD display + charge snapshots convert consistently (% minor units)', r.total_display_minor;
end $$;

-- Booking service in cart -> rejected with the precise message (§2.3)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''NGN'', ''NGN'', null, null, ''t'')',
           :'lines_booking', :'addr'),
    '%Booking services cannot enter the cart%');
commit;
\echo '   ok: booking service blocked from cart'

-- Orphan add-on -> rejected
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''NGN'', ''NGN'', null, null, ''t'')',
           :'lines_orphan', :'addr'),
    '%must belong to a product line%');
commit;
\echo '   ok: add-on without parent rejected'

-- Zero quantity -> structural rejection
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''NGN'', ''NGN'', null, null, ''t'')',
           :'lines_badqty', :'addr'),
    '%Malformed checkout line payload%');
commit;
\echo '   ok: malformed quantity rejected'

-- Unknown product -> rejected (client ids are revalidated, §3.3)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''NGN'', ''NGN'', null, null, ''t'')',
           :'lines_unknown', :'addr'),
    '%unknown or inactive%');
commit;
\echo '   ok: unknown product id rejected'

-- Missing FX rate for a non-NGN display currency -> loud failure, never 1.0
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''USD'', ''USD'', null, null, ''t'')',
           :'lines_ok', :'addr'),
    '%FX rate missing or non-positive%');
commit;
\echo '   ok: missing rate never silently uses 1.0'

-- Unsupported charge currency (GBP) -> rejected at the DB boundary (§2.6)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_quote(%L::jsonb, %L::jsonb, ''GBP'', ''GBP'', 0.00050, 0.00050, ''t'')',
           :'lines_ok', :'addr'),
    '%not supported by the configured Paystack account%');
commit;
\echo '   ok: GBP charge currency refused by RPC (adapter must map to USD/NGN)'

-- Zone: Lekki => lagos-island; non-NG => intl
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q_island as select * from public.create_quote(
    :'lines_ok'::jsonb, :'addr_island'::jsonb, 'NGN', 'NGN', null, null, 't');
commit;
do $$
declare z text; s bigint;
begin
  select zone_code, shipping_base_minor into z, s from t_q_island;
  assert z = 'lagos-island', 'FAIL island zone';
  assert s = (select amount_minor from public.shipping_rate_cards
              where zone_code='lagos-island' and shipping_class='standard'),
         'FAIL island shipping';
  raise notice 'ok: Lagos island split + rate card lookup correct';
end $$;

-- ===========================================================================
-- C. Order creation: atomic, revalidated, idempotent  (§15.4, §18.4, §19.2)
-- ===========================================================================
\echo '>> C. create_order_from_quote'

begin;
  select test.as_user((select aid from t_ids));
  create table test.t_o1 as select * from public.create_order_from_quote(
    (select quote_id from t_q1), :'lines_ok'::jsonb, :'addr'::jsonb, 'idem-1');
commit;

do $$
declare o record; i1 record; i2 record; stock int; ev int;
begin
  select * into o from t_o1;
  assert o.reused is false, 'FAIL first creation flagged reused';
  assert o.order_number ~ '^CV-ORD-\d{8}-\d{4}$', 'FAIL order number format';
  assert o.payment_reference ~ '^CV-\d{8}-[0-9A-F]{6}$', 'FAIL payment ref format';

  select * into i1 from public.order_items
   where order_id = o.order_id and item_kind = 'product';
  select * into i2 from public.order_items
   where order_id = o.order_id and item_kind = 'service_addon';

  assert i1.name_snapshot = (select name from public.products where id = (select cam from t_cat)),
         'FAIL product snapshot name';
  assert i1.sku_snapshot = 'HK-IPC-T124', 'FAIL sku snapshot';
  assert i2.parent_order_item_id = i1.id, 'FAIL addon parent linkage';
  assert i2.line_total_base_minor = i2.unit_price_base_minor * i2.quantity, 'FAIL generated column';

  select inventory_qty into stock from public.products where id = (select cam from t_cat);
  assert stock = (select cam_stock from t_cat) - 2, 'FAIL inventory reservation';

  select count(*) into ev from public.order_events where order_id = o.order_id
    and event_type = 'created';
  assert ev = 1, 'FAIL created event';

  update t_state
     set stock_cam = (select inventory_qty from public.products
                      where id = (select cam from t_cat)),
         orders = 1, items = 2, addons = 1;
  raise notice 'ok: atomic order + snapshot items + parent map + stock reserved';
end $$;

-- Same idempotency key -> replay of the same order, zero new rows (§18.4)
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_o1b as select * from public.create_order_from_quote(
    (select quote_id from t_q1), :'lines_ok'::jsonb, :'addr'::jsonb, 'idem-1');
commit;
do $$
declare r record; n int;
begin
  select * into r from t_o1b;
  assert r.reused is true, 'FAIL replay not flagged';
  assert r.order_id = (select order_id from t_o1), 'FAIL replay returned different order';
  select count(*) into n from public.orders;
  assert n = 1, format('FAIL replay created extra orders (%s)', n);
  raise notice 'ok: idempotency key replay returns the same order';
end $$;

-- Same quote, different key -> blocked by orders_quote_id_key (one order per quote)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q1), :'lines_ok', :'addr', 'idem-2'),
    '%orders_quote_id_key%');
commit;
\echo '   ok: quote double-spend blocked at unique index'

-- Cart tampering after quote -> rejected (price/qty authority, §2.2)
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q2 as select * from public.create_quote(
    :'lines_ok'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q2), :'lines_three', :'addr', 'idem-x'),
    '%Cart changed after quoting%');
commit;
\echo '   ok: quantity change after quote invalidates'

-- Address tampering -> rejected
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q2), :'lines_ok', :'addr_island', 'idem-y'),
    '%Address changed after quoting%');
commit;
\echo '   ok: address swap after quote invalidates'

-- Expired quote -> rejected (§19.2)
begin;
  select test.as_service();
  update public.currency_quotes set expires_at = now() - interval '1 second'
   where id = (select quote_id from t_q2);
commit;
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q2), :'lines_ok', :'addr', 'idem-z'),
    '%Quote expired%');
commit;
\echo '   ok: expired quote rejected'

-- Server-side price change between quote and order -> rejected + rolled back
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q3 as select * from public.create_quote(
    :'lines_one'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
commit;
begin;
  select test.as_service();
  update public.products set unit_price_minor = unit_price_minor + 1000000
   where id = (select cam from t_cat);
commit;
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q3), :'lines_one', :'addr', 'idem-p'),
    '%Prices changed after quoting%');
commit;
begin;
  select test.as_service();
  update public.products
     set unit_price_minor = (select cam_price from t_cat)
   where id = (select cam from t_cat);
commit;
do $$
declare n int; begin
  select count(*) into n from public.orders;
  assert n = 1, 'FAIL: rolled-back price-mismatch attempt left an order';
  raise notice 'ok: price drift caught; transaction left no residue';
end $$;

-- Out-of-stock at order time (after quote) -> rejected, stock untouched
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q4 as select * from public.create_quote(
    :'lines_one'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
commit;
-- drain stock as service_role (a customer-side UPDATE would be a silent
-- RLS no-op — which is itself verified here: RLS filters, never errors)
begin;
  select test.as_service();
  update public.products set inventory_qty = 0 where id = (select cam from t_cat);
commit;
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('select * from public.create_order_from_quote(%L, %L::jsonb, %L::jsonb, %L)',
           (select quote_id from t_q4), :'lines_one', :'addr', 'idem-s'),
    '%Insufficient stock%');
commit;
do $$
declare n int; begin
  select count(*) into n from public.orders;
  assert n = 1, 'FAIL: failed order attempt left residue';
  raise notice 'ok: inventory race caught at order time, no residue';
end $$;
begin;
  select test.as_service();
  update public.products set inventory_qty = (select cam_stock from t_cat) - 2
   where id = (select cam from t_cat);
commit;

-- ===========================================================================
-- D. Webhook finalization                                   (§15, §19.3)
-- ===========================================================================
\echo '>> D. process_paystack_event / finalize_paid_order'

-- Unverified payload is refused by the DB itself
begin;
  select test.as_service();
  select test.expect_error(
    format('select public.process_paystack_event(%L, %L, %L, %s, %L, %L, %L::jsonb, false)',
           'unverified:event1', 'charge.success', (select payment_reference from t_o1),
           (select total_charge_minor from t_o1), 'NGN', 'success', '{}'),
    '%Refusing to process an unverified payment event%');
commit;
\echo '   ok: unverified events never reach finalization'

-- Fresh payable order (re-quote; original was consumed)
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q5 as select * from public.create_quote(
    :'lines_ok'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
  create table test.t_o2 as select * from public.create_order_from_quote(
    (select quote_id from t_q5), :'lines_ok'::jsonb, :'addr'::jsonb, 'idem-w');
commit;

-- Success webhook, exact match -> paid + transaction id + journal processed
begin;
  select test.as_service();
  create table test.t_evt as select public.process_paystack_event(
    'charge.success:' || (select payment_reference from t_o2),
    'charge.success',
    (select payment_reference from t_o2),
    (select total_charge_minor from t_o2),
    (select charge_currency::text from public.orders where id = (select order_id from t_o2)),
    'success',
    jsonb_build_object('data', jsonb_build_object(
      'id', 987654321, 'reference', (select payment_reference from t_o2),
      'amount', (select total_charge_minor from t_o2), 'currency', 'NGN', 'status', 'success')),
    true
  ) as outcome;
commit;

do $$
declare o record; r text;
begin
  select outcome into r from t_evt;
  assert r = 'paid', format('FAIL outcome %s', r);
  select * into o from public.orders where id = (select order_id from t_o2);
  assert o.status = 'paid' and o.payment_status = 'paid' and o.paid_at is not null, 'FAIL order not paid';
  assert o.paystack_transaction_id = 987654321, 'FAIL tx id not persisted';
  assert (select count(*) from public.order_events where order_id = o.id and event_type='payment_paid') = 1, 'FAIL event row';
  assert (select processed_at is not null from public.payment_events
           where event_key = 'charge.success:' || o.payment_reference), 'FAIL journal not marked processed';
  raise notice 'ok: verified success finalizes order + journal + audit event';
end $$;

-- Duplicate delivery -> idempotent no-op, no double events
begin;
  select test.as_service();
  create table test.t_dup as select public.process_paystack_event(
    'charge.success:' || (select payment_reference from t_o2),
    'charge.success', (select payment_reference from t_o2),
    (select total_charge_minor from t_o2), 'NGN', 'success', '{}'::jsonb, true) as outcome;
commit;
do $$
declare r text; evs int;
begin
  select outcome into r from t_dup;
  assert r = 'duplicate', format('FAIL duplicate outcome %s', r);
  select count(*) into evs from public.order_events
   where order_id = (select order_id from t_o2) and event_type = 'payment_paid';
  assert evs = 1, 'FAIL duplicate created a second event';
  raise notice 'ok: duplicate webhook is a no-op';
end $$;

-- Amount mismatch -> payment_review, NEVER fulfillment
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q6 as select * from public.create_quote(
    :'lines_one'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
  create table test.t_o3 as select * from public.create_order_from_quote(
    (select quote_id from t_q6), :'lines_one'::jsonb, :'addr'::jsonb, 'idem-m');
commit;
begin;
  select test.as_service();
  create table test.t_mm as select public.process_paystack_event(
    'tampered:' || random()::text || ':' || (select payment_reference from t_o3),
    'charge.success', (select payment_reference from t_o3),
    (select total_charge_minor from t_o3) + 1000, 'NGN', 'success',
    '{}'::jsonb, true) as outcome;
commit;
do $$
declare o record; r text;
begin
  select outcome into r from t_mm;
  assert r = 'mismatch', format('FAIL mismatch outcome %s', r);
  select * into o from public.orders where id = (select order_id from t_o3);
  assert o.status = 'payment_review' and o.payment_status = 'failed', 'FAIL order entered wrong state';
  assert o.paid_at is null, 'FAIL mismatch marked paid';
  raise notice 'ok: amount mismatch routes to payment_review (no fulfillment)';
end $$;

-- Failed event cannot overwrite a paid order
begin;
  select test.as_service();
  create table test.t_fo as select public.process_paystack_event(
    'charge.failed:' || (select payment_reference from t_o2),
    'charge.failed', (select payment_reference from t_o2),
    (select total_charge_minor from t_o2), 'NGN', 'failed', '{}'::jsonb, true) as outcome;
commit;
do $$
declare r text; st text;
begin
  select outcome into r from t_fo;
  -- 'paid' is a terminal state; every event against it resolves to the
  -- already_paid no-op before status dispatch, failures included.
  assert r = 'already_paid', format('FAIL failed-overwrite outcome %s', r);
  select status::text into st from public.orders where id = (select order_id from t_o2);
  assert st = 'paid', 'FAIL paid order was overwritten by failure event';
  raise notice 'ok: failed event cannot demote a paid order';
end $$;

-- Unknown reference -> unlinked, retained, processed_at NULL for ops alert
begin;
  select test.as_service();
  create table test.t_un as select public.process_paystack_event(
    'charge.success:GHOST-REF', 'charge.success', 'GHOST-REF',
    12345, 'NGN', 'success', '{}'::jsonb, true) as outcome;
commit;
do $$
declare r text; pa timestamptz;
begin
  select outcome into r from t_un;
  assert r = 'unlinked', format('FAIL ghost outcome %s', r);
  select processed_at into pa from public.payment_events where event_key = 'charge.success:GHOST-REF';
  assert pa is null, 'FAIL unlinked event marked processed';
  raise notice 'ok: unmatched references retained for reconciliation';
end $$;

-- Integrity guard: item totals must equal the subtotal before fulfillment
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q7 as select * from public.create_quote(
    :'lines_one'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
  create table test.t_o4 as select * from public.create_order_from_quote(
    (select quote_id from t_q7), :'lines_one'::jsonb, :'addr'::jsonb, 'idem-i');
commit;
begin;
  select test.as_service();
  delete from public.order_items where order_id = (select order_id from t_o4);
  create table test.t_im as select public.process_paystack_event(
    'integrity:' || (select payment_reference from t_o4), 'charge.success',
    (select payment_reference from t_o4), (select total_charge_minor from t_o4),
    'NGN', 'success', '{}'::jsonb, true) as outcome;
commit;
do $$
declare r text; st text;
begin
  select outcome into r from t_im;
  assert r = 'integrity_mismatch', format('FAIL integrity outcome %s', r);
  select status::text into st from public.orders where id = (select order_id from t_o4);
  assert st = 'payment_review', 'FAIL integrity mismatch not quarantined';
  raise notice 'ok: item/subtotal integrity verified before fulfillment';
end $$;

-- Recovery path: server-side verify journals + finalizes via the SAME core
begin;
  select test.as_user((select aid from t_ids));
  create table test.t_q8 as select * from public.create_quote(
    :'lines_one'::jsonb, :'addr'::jsonb, 'NGN', 'NGN', null, null, 't');
  create table test.t_o5 as select * from public.create_order_from_quote(
    (select quote_id from t_q8), :'lines_one'::jsonb, :'addr'::jsonb, 'idem-v');
commit;
begin;
  select test.as_service();
  create table test.t_vf as select public.finalize_paid_order(
    (select payment_reference from t_o5),
    (select total_charge_minor from t_o5), 'NGN', 'success', 55555, null, 'verify') as outcome;
commit;
do $$
declare r text; n int;
begin
  select outcome into r from t_vf;
  assert r = 'paid', format('FAIL verify outcome %s', r);
  select count(*) into n from public.payment_events
   where event_key like 'verify:%' and provider_status = 'success';
  assert n >= 1, 'FAIL verify path not journalled';
  raise notice 'ok: browser-recovery verify shares the finalization core';
end $$;

-- ===========================================================================
-- E. Service request domain                                  (§2.4, §19.1)
-- ===========================================================================
\echo '>> E. service_requests'

begin;
  select test.as_user((select aid from t_ids));
  insert into public.service_requests (user_id, service_id, status, site_address, notes)
  values ((select aid from t_ids), (select booking from t_cat), 'requested',
          :'addr'::jsonb, 'Please inspect the existing network cabinet.'),
         ((select aid from t_ids), (select booking from t_cat), 'requested',
          :'addr'::jsonb, 'Second request same day');
commit;
do $$
declare r record; nums text[];
begin
  select count(*) into r from public.service_requests where user_id =
    (select aid from t_ids);
  assert r.count = 2, 'FAIL service request count';
  select array_agg(request_number order by request_number) into nums
   from public.service_requests;
  assert nums[1] ~ '^SR-\d{8}-\d{4}$', format('FAIL request number format %s', nums[1]);
  assert nums[2] > nums[1], 'FAIL sequence did not increment';
  raise notice 'ok: requests persisted with daily-sequential SR numbers (%)', nums;
end $$;

-- add_on service cannot create a booking (trigger guard)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('insert into public.service_requests (user_id, service_id, status, site_address)
            values (%L, %L, ''requested'', %L::jsonb)',
           (select aid from t_ids), (select addon from t_cat), :'addr'),
    '%Only booking services may create service requests%');
commit;
\echo '   ok: add-on service blocked from booking domain'

-- Customer cannot self-approve (insert policy WITH CHECK)
begin;
  select test.as_user((select aid from t_ids));
  select test.expect_error(
    format('insert into public.service_requests (user_id, service_id, status, site_address)
            values (%L, %L, ''scheduled'', %L::jsonb)',
           (select aid from t_ids), (select booking from t_cat), :'addr'),
    '%row-level security%');
commit;
\echo '   ok: status pinned to requested for customer inserts'

-- Cross-customer invisibility + no self-update path
begin;
  select test.as_user((select bid from t_ids));
  create table test.t_sr_b as select count(*)::int as n from public.service_requests;
  update public.service_requests set status = 'completed'
   where user_id = (select aid from t_ids);
commit;
do $$
declare v_cnt int; st text;
begin
  select n into v_cnt from t_sr_b;
  assert v_cnt = 0, 'FAIL customer B can read customer A service requests';
  select status::text into st from public.service_requests
   where user_id = (select aid from t_ids) limit 1;
  assert st = 'requested', 'FAIL customer B mutated A''s request';
  raise notice 'ok: service_requests cross-tenant isolation holds';
end $$;

-- ===========================================================================
-- F. RLS negatives on orders (customer view)                        (§19.1)
-- ===========================================================================
\echo '>> F. orders/order_items/order_events isolation'

begin;
  select test.as_user((select bid from t_ids));
  create table test.t_b_view as select
    (select count(*) from public.orders)              as o,
    (select count(*) from public.order_items)         as i,
    (select count(*) from public.order_events)        as e,
    (select count(*) from public.currency_quotes)     as q;
  update public.orders set status = 'delivered' where id = (select order_id from t_o1);
commit;
do $$
declare r record; st text;
begin
  select * into r from t_b_view;
  assert r.o = 0 and r.i = 0 and r.e = 0 and r.q = 0, 'FAIL: bob sees alice''s data';
  -- t_o1 is alice's *pending_payment* order (t_o2 is the paid one); bob's
  -- UPDATE must be a silent no-op under RLS, so the status stays put.
  select status::text into st from public.orders where id = (select order_id from t_o1);
  assert st = 'pending_payment', 'FAIL: bob modified alice order';
  raise notice 'ok: zero leakage across tenants; writes silently policy-denied';
end $$;

-- Staff can see everything
begin;
  select test.as_user((select sid from t_ids));
  create table test.t_staff as select count(*)::int as n from public.orders;
commit;
do $$
declare v_cnt int;
begin
  select n into v_cnt from t_staff;
  assert v_cnt >= 5, format('FAIL staff sees %s orders', v_cnt);
  raise notice 'ok: staff visibility intact';
end $$;

-- ===========================================================================
-- G. Housekeeping jobs + realtime publication                       (§20.4)
-- ===========================================================================
\echo '>> G. jobs, realtime, updated_at'

begin;
  select test.as_service();
  -- o3 (the amount-mismatch quarantine) is pushed into natural expiry:
  -- back to pending_payment, expiry in the past. It reserved exactly 1 unit.
  update public.orders
     set status = 'pending_payment', payment_status = 'pending',
         expires_at = now() - interval '1 hour'
   where id = (select order_id from t_o3);
  create table test.t_pre as
    select inventory_qty as stock from public.products where id = (select cam from t_cat);
  create table test.t_hk as select public.cancel_expired_unpaid_orders() as cancelled;
commit;
do $$
declare v_n int; v_st text; v_after int; v_want int;
begin
  select cancelled into v_n from t_hk;
  assert v_n = 1, format('FAIL: cancelled %s orders, expected exactly 1', v_n);
  select status::text into v_st from public.orders where id = (select order_id from t_o3);
  assert v_st = 'cancelled', 'FAIL: expired order not cancelled';
  -- o3 reserved 1 camera unit on creation and must release exactly that on expiry.
  select stock + 1 into v_want from t_pre;
  select inventory_qty into v_after from public.products where id = (select cam from t_cat);
  assert v_after = v_want,
         format('FAIL: inventory release wrong (stock %s, expected %s)', v_after, v_want);
  assert (select count(*) from public.order_events
          where order_id = (select order_id from t_o3)
            and event_type = 'expired_unpaid') = 1, 'FAIL: expiry event missing';
  update t_state set stock_cam = v_after;
  raise notice 'ok: expiry cancellation released reserved stock + wrote audit event';
end $$;

begin;
  select test.as_service();
  update public.currency_quotes set expires_at = now() - interval '2 days'
   where id = (select quote_id from t_q2);
  create table test.t_pq as select public.purge_expired_quotes() as n;
commit;
do $$
declare v_cnt int; still int;
begin
  select n into v_cnt from t_pq;
  assert v_cnt >= 1, 'FAIL: purge deleted nothing';
  select count(*) into still from public.currency_quotes where id = (select quote_id from t_q2);
  assert still = 0, 'FAIL: stale quote survived';
  raise notice 'ok: purge_expired_quotes removed % stale quote(s)', v_cnt;
end $$;

-- consumed quotes must NEVER be purged (FK + guard): t_q1 has an order
do $$
declare c int;
begin
  select count(*) into c from public.currency_quotes where id = (select quote_id from t_q1);
  assert c = 1, 'FAIL: quote backing a live order was purged';
  raise notice 'ok: order-backed quote survives purge';
end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('orders', 'order_events');
  assert n = 2, 'FAIL: realtime publication incomplete';
  raise notice 'ok: orders + order_events in supabase_realtime';
end $$;

-- updated_at triggers
begin;
  select test.as_service();
  create table test.t_ts as select updated_at from public.products where sku = 'HK-IPC-T124';
  update public.products set description = description where sku = 'HK-IPC-T124';
commit;
do $$
declare old_t timestamptz; new_t timestamptz;
begin
  select updated_at into old_t from t_ts;
  select updated_at into new_t from public.products where sku = 'HK-IPC-T124';
  assert new_t > old_t, 'FAIL updated_at trigger';
  raise notice 'ok: set_updated_at fires';
end $$;

\echo 'ALL DB VERIFICATION ASSERTIONS PASSED'
