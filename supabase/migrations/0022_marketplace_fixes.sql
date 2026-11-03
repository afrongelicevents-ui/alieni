-- Core marketplace fixes (audit of 3 November 2026). Purely additive, except one
-- constraint that is removed because it blocked cleaners without a KvK number.
--   1. KvK is no longer a condition for advertising (constraint dropped; columns stay, unused)
--   2. optional declaration: works independently / as a company
--   3. precise distance for search (uses the stored coordinates)

-- ========== 1. KvK no longer required ==========
alter table cleaner_profiles drop constraint if exists cleaner_business_needs_kvk;

-- ========== 2. optional declaration ==========
alter table cleaner_profiles add column if not exists works_as text;
alter table cleaner_profiles drop constraint if exists cleaner_works_as_check;
alter table cleaner_profiles add constraint cleaner_works_as_check check (works_as is null or works_as in ('independent', 'company'));

-- ========== 3. distance from the stored location of every published ad ==========
-- Runs as the caller (RLS applies): only published ads are visible to the public.
create or replace function cleaner_distances(p_lng double precision, p_lat double precision)
returns table (id uuid, distance_km numeric)
language sql stable security invoker set search_path = public as $$
  select cp.id,
         round((st_distance(cp.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 1) as distance_km
  from cleaner_profiles cp
  where cp.status = 'published' and cp.location is not null;
$$;
grant execute on function cleaner_distances(double precision, double precision) to anon, authenticated;
