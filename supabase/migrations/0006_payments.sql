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
