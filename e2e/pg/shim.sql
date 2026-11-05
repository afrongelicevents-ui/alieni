-- Minimal stand-ins for what Supabase provides, so the real migrations run on a plain Postgres.
create schema if not exists auth;
create schema if not exists storage;
grant usage on schema auth to anon, authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
-- PostGIS stand-ins: location columns become plain text, distance helpers return neutral values.
create domain geography as text;
create function st_dwithin(a geography, b geography, m double precision) returns boolean language sql immutable as $$ select true $$;
create function st_distance(a geography, b geography) returns double precision language sql immutable as $$ select 0::double precision $$;
create function st_makepoint(x double precision, y double precision) returns text language sql immutable as $$ select 'POINT(' || x || ' ' || y || ')' $$;
create function st_setsrid(g text, srid integer) returns text language sql immutable as $$ select g $$;
