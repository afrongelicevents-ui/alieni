-- Part 18: three fixes from the security review of Parts 15-17.
--   1. an admin-hidden or admin-removed ad can no longer be undone by deleting it and creating a new one
--   2. a removed job can no longer be put back online by its owner
--   3. distance search works again (0026 hid the exact location, which broke cleaner_distances()), and it
--      measures to a point snapped to a ~1 km grid, so repeated queries cannot reveal a home address
-- Idempotent; no data is changed.

-- ========== 1. moderated ads cannot be deleted by their owner ==========
-- (account erasure goes through erase_user_data(), which is not affected)
drop policy if exists "cleaner deletes own ad" on cleaner_profiles;
create policy "cleaner deletes own ad" on cleaner_profiles for delete
  using (user_id = auth.uid() and not moderated);

-- ========== 2. a removed job stays removed (owner), only the system or an admin can change it ==========
create or replace function public.guard_job_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then return new; end if;
  if (new.awarded_response_id, new.awarded_at, new.ended_at, new.ended_by) is distinct from (old.awarded_response_id, old.awarded_at, old.ended_at, old.ended_by) then
    raise exception 'protected column';
  end if;
  if new.status = 'filled' and old.status is distinct from 'filled' then
    raise exception 'protected column';
  end if;
  if old.status = 'filled' and new.status is distinct from 'filled' then
    raise exception 'job is awarded';
  end if;
  if old.status = 'removed' and new.status is distinct from 'removed' and not public.is_admin() then
    raise exception 'job is removed';
  end if;
  if old.status = 'filled' and (new.frequency, new.weekdays, new.visit_start, new.visit_hours, new.start_date, new.end_date, new.business_id)
     is distinct from (old.frequency, old.weekdays, old.visit_start, old.visit_hours, old.start_date, old.end_date, old.business_id) then
    raise exception 'job is awarded';
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_guard_update on jobs;
create trigger jobs_guard_update before update on jobs for each row execute function public.guard_job_update();

-- ========== 3. distances without exposing the exact location ==========
-- Runs with the owner's rights (the exact location column is not readable by visitors) and only returns an id and a
-- distance in km to a point snapped to a 0.01 degree grid (about 1 km), for published ads.
create or replace function public.cleaner_distances(p_lng double precision, p_lat double precision)
returns table (id uuid, distance_km numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select cp.id,
         round((st_distance(st_snaptogrid(cp.location::geometry, 0.01)::geography,
                            st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 1) as distance_km
  from public.cleaner_profiles cp
  where cp.status = 'published' and cp.location is not null;
$$;
revoke execute on function public.cleaner_distances(double precision, double precision) from public;
grant execute on function public.cleaner_distances(double precision, double precision) to anon, authenticated;
