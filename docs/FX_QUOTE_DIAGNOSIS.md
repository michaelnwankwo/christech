# Checkout quote / FX diagnosis

## What `currency_quotes` actually is

`public.currency_quotes` is **not an exchange-rate source table**. It is the
short-lived, user-owned output ledger written by the `create_quote` SECURITY
DEFINER RPC. Each row requires a real `user_id`, cart/address hashes, shipping
zone, frozen totals and an expiry. An empty table is normal before the first
successful checkout quote (and the maintenance job purges expired, unused
rows). Inserting a global dummy row into this table would violate its schema
and ownership model.

The quote route obtains rates in this order:

1. NGN display + NGN charge: deterministic local parity (`1.000000`) with no
   network or database dependency.
2. Short-lived in-process provider cache.
3. `FX_PROVIDER_BASE_URL` (`https://open.er-api.com/v6` by default), requested
   as `/latest/NGN`.
4. `MANUAL_FX_RATES` from server environment.
5. Operator-managed rows in `public.fx_rate_defaults` (migration 0012).

A successful `create_quote` call then inserts the complete transactional row
into `public.currency_quotes`.

## Why the old route could fail

The previous handler called the external provider before checking whether both
display and charge currencies were NGN. Therefore an FX network/provider
failure could block an NGN-to-NGN quote even though its mathematically correct
rate is always 1. Separately, missing RPC/schema migrations were collapsed to
`Request could not be processed`, obscuring the operational cause.

The route now short-circuits local parity, catches provider/default-table/RPC
failures, emits structured logs, and maps missing schema/RPC error codes to an
actionable 503 response.

## Required production setup

Apply all migrations through `0012_fx_rate_defaults.sql`. Migration 0012
creates the correct global fallback table and idempotently seeds:

```sql
insert into public.fx_rate_defaults
  (base_currency, quote_currency, rate, provider)
values ('NGN', 'NGN', 1.000000000000, 'local-ngn-parity')
on conflict (base_currency, quote_currency) do update
set rate = excluded.rate,
    provider = excluded.provider,
    updated_at = now();
```

Do **not** insert a dummy row into `currency_quotes`.

## Netlify / `.env.local`

- `FX_PROVIDER_BASE_URL=https://open.er-api.com/v6`
- `FX_PROVIDER_BASE_CURRENCY=NGN`
- `FX_PROVIDER_API_KEY=` is optional for the default open.er-api endpoint.
- `MANUAL_FX_RATES=USD=0.00065;GBP=0.00051;EUR=0.00060` is the reviewed
  server-side fallback format. Keep these values current.
- `MASSIVE_API_KEY` and `FX_API_KEY` are **not read by this codebase**. A
  different provider must expose the same `/latest/NGN` response shape or be
  implemented with a provider-specific adapter; wire its secret through
  `FX_PROVIDER_API_KEY` without a `NEXT_PUBLIC_` prefix.

NGN checkout does not require any external FX API key after this change.
