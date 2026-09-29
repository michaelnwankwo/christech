-- 0014_service_quote_requests.sql
--
-- Quote-on-Demand via WhatsApp (guest-accessible lead capture).
--
-- Why a dedicated table (instead of reusing service_requests): the
-- authenticated booking domain pins rows to auth.uid() — user_id NOT NULL,
-- customer RLS `user_id = auth.uid()`, and the wizard forces sign-in. The
-- WhatsApp quote flow must accept GUESTS (no sign-in) so no lead is ever
-- lost at the auth wall, so quote leads live here with a NULLABLE user_id,
-- their own QUOTE-* reference series, and snapshot columns that preserve
-- the submitted lead exactly as dispatched even if the catalog row later
-- changes or is removed.
--
-- Baseline prices are intentionally NOT stored or referenced: every request
-- is "Custom Quote Required" and priced by staff after review.

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.service_quote_requests (
  id uuid primary key default gen_random_uuid(),

  quote_reference text not null unique,

  -- Nullable on purpose: guests have no auth.users row. When a signed-in
  -- customer submits, the API links their id for account-side tracking.
  user_id uuid references public.users(id) on delete set null,

  -- Nullable + snapshotted: the lead must survive catalog edits/removal.
  service_id uuid references public.services(id) on delete set null,
  service_title text not null,
  service_code text not null,
  estimated_duration text,

  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  site_address text not null,

  preferred_date date,
  time_window text,
  site_notes text,

  status text not null default 'new'
    check (status in ('new', 'contacted', 'quoted', 'won', 'lost', 'spam')),

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_quote_requests_created_idx
  on public.service_quote_requests (created_at desc);

create index service_quote_requests_status_idx
  on public.service_quote_requests (status, created_at desc);

create index service_quote_requests_user_idx
  on public.service_quote_requests (user_id);

-- ---------------------------------------------------------------------------
-- QUOTE-YYYYMMDD-0001 reference series (daily_sequences, kind 'quote'),
-- mirroring next_daily_ref()/assign_request_number() for the quote domain.
-- ---------------------------------------------------------------------------
create or replace function public.next_quote_ref()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_value bigint;
begin
  insert into public.daily_sequences as ds (seq_date, kind, last_value)
  values (v_today, 'quote', 1)
  on conflict (seq_date, kind)
  do update set last_value = ds.last_value + 1
  returning ds.last_value into v_value;

  return 'QUOTE-' || to_char(v_today, 'YYYYMMDD') || '-' ||
         lpad(v_value::text, 4, '0');
end;
$$;

-- The database assigns the human reference (API inserts stay unnumbered).
create or replace function public.assign_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_reference is null or new.quote_reference = '' then
    new.quote_reference := public.next_quote_ref();
  end if;
  return new;
end;
$$;

create trigger service_quote_requests_assign_reference
before insert on public.service_quote_requests
for each row execute function public.assign_quote_reference();

create trigger service_quote_requests_updated_at
before update on public.service_quote_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — the ONLY anon-insertable table in the schema. Guests (anon role)
-- and signed-in customers may SUBMIT a quote lead; anonymous callers can
-- never read/update/delete, and the insert policy pins status to 'new' so
-- a forged payload cannot self-advance the funnel. Staff own everything.
-- ---------------------------------------------------------------------------
alter table public.service_quote_requests enable row level security;

create policy service_quote_requests_insert_open
on public.service_quote_requests
for insert
to anon, authenticated
with check (status = 'new');

create policy service_quote_requests_read_own
on public.service_quote_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff()
);

create policy service_quote_requests_staff_write
on public.service_quote_requests
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

notify pgrst, 'reload schema';

commit;
