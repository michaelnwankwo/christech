-- ============================================================================
-- Test harness setup: emulate the parts of a Supabase project this app
-- assumes, on bare Postgres, so migrations + RLS + RPCs can be verified.
-- (On a real Supabase instance these objects are managed by the platform.)
-- ============================================================================

-- pgcrypto first: the auth.users stub below uses gen_random_uuid().
create extension if not exists pgcrypto;

-- Client roles (PostgREST identity model)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Minimal auth schema: auth.users + the JWT claim accessors Supabase ships.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(coalesce(auth.jwt() ->> 'role', ''), '')::text;
$$;

-- The real Supabase platform exposes auth to its roles; reproduce enough of
-- that for the harness (service_role provisions test identities).
grant usage on schema auth to anon, authenticated, service_role;
grant all on auth.users to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase default privileges: client roles hold broad table grants and RLS
-- is the actual security boundary. Reproduce that posture exactly so the RLS
-- assertions below test what production will run.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Assertion helpers (test schema only — never shipped).
-- The fixture/ledger tables below are created IN the test schema (not temp)
-- and readable by every client role, because assertions run under switched
-- identities (authenticated/service_role) that must still see them.
-- ----------------------------------------------------------------------------
create schema if not exists test;
grant all on schema test to anon, authenticated, service_role;

alter default privileges for role postgres  in schema test grant all on tables to public;
alter default privileges for role authenticated in schema test grant all on tables to public;
alter default privileges for role service_role  in schema test grant all on tables to public;
alter default privileges for role anon          in schema test grant all on tables to public;

-- Asserts the statement raises an error whose message matches p_pattern.
create or replace function test.expect_error(p_sql text, p_pattern text)
returns text
language plpgsql
as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like p_pattern then
      raise exception 'WRONG ERROR: got [%] expected like [%]', v_msg, p_pattern
        using errcode = 'CV002';
    end if;
    return v_msg;
  end;
  raise exception 'EXPECTED FAILURE did not happen: %', p_sql
    using errcode = 'CV002';
end;
$$;

-- Identity switching helpers (SET LOCAL keeps each assertion block tidy).
create or replace function test.as_user(p_uuid uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uuid::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.as_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create or replace function test.as_service()
returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
