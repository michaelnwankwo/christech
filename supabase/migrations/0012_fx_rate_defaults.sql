-- ============================================================================
-- 0012_fx_rate_defaults
-- Durable fallback FX reference data. This is deliberately separate from
-- currency_quotes: currency_quotes contains short-lived, user-owned checkout
-- snapshots and cannot hold a global seed row (user_id/totals/hashes required).
-- ============================================================================

create table if not exists public.fx_rate_defaults (
  base_currency public.currency_code not null default 'NGN',
  quote_currency public.currency_code not null,
  rate numeric(24, 12) not null check (rate > 0),
  provider text not null default 'database-default',
  updated_at timestamptz not null default now(),
  primary key (base_currency, quote_currency),
  constraint fx_rate_defaults_ngn_base check (base_currency = 'NGN')
);

alter table public.fx_rate_defaults enable row level security;

grant select on public.fx_rate_defaults to anon, authenticated;
grant insert, update, delete on public.fx_rate_defaults to authenticated;

-- Rates contain no secrets. Checkout uses the authenticated caller's SSR
-- client; public read also keeps /api/fx-compatible diagnostics possible.
drop policy if exists fx_rate_defaults_public_read on public.fx_rate_defaults;
create policy fx_rate_defaults_public_read
  on public.fx_rate_defaults for select
  to anon, authenticated
  using (true);

drop policy if exists fx_rate_defaults_staff_write on public.fx_rate_defaults;
create policy fx_rate_defaults_staff_write
  on public.fx_rate_defaults for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Required base parity seed. Safe and idempotent.
insert into public.fx_rate_defaults
  (base_currency, quote_currency, rate, provider)
values
  ('NGN', 'NGN', 1.000000000000, 'local-ngn-parity')
on conflict (base_currency, quote_currency) do update set
  rate = excluded.rate,
  provider = excluded.provider,
  updated_at = now();

-- Optional operator-managed foreign fallbacks (examples only; use reviewed,
-- current rates before uncommenting):
-- insert into public.fx_rate_defaults values
--   ('NGN', 'USD', 0.000650000000, 'operator-reviewed', now()),
--   ('NGN', 'GBP', 0.000510000000, 'operator-reviewed', now()),
--   ('NGN', 'EUR', 0.000600000000, 'operator-reviewed', now())
-- on conflict (base_currency, quote_currency) do update set
--   rate = excluded.rate, provider = excluded.provider, updated_at = now();
