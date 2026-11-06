-- Part 14 (variant B): protect private company information, with NO new callable function.
-- Until now every signed-in user (and anyone holding the public key) could read these columns of a company
-- that has a published job: contact first/last name, VAT number, unit count, price, billing dates and the
-- payment-failed flag. The public jobs board only needs the company NAME and TYPE.
--   1. business_public: a restricted, read-only view with id, company_name, business_type only. The visibility
--      logic is written directly inside the view, so there is no helper function and no extra schema that any API
--      (REST, GraphQL or other) could expose: companies with a published job, the viewer's own company, companies
--      a cleaner has worked for or is connected to, and everything for admins.
--   2. business_profiles is no longer readable by anyone except its owner and admins.
--   3. the two existing helpers the rules use get a hardened (empty) search_path and fully qualified names.
-- Additive apart from replacing one rule by two narrower ones and removing the helper added in Part 13. No data is touched.

-- 1. the two existing helpers: same logic, hardened search_path, qualified names
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.cleaner_connected_to_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    join public.business_profiles bp on bp.user_id = c.household_id
    join public.cleaner_profiles cp on cp.user_id = c.cleaner_id
    where bp.id = p_business_id and cp.user_id = auth.uid() and c.status = 'active'
  );
$$;

-- 2. the view: three columns, read-only (DISTINCT makes it non-updatable, so it stays read-only even if a later
--    migration ever grants write rights by mistake), runs with its owner's rights, security barrier.
--    All logic is inline and fully qualified; the only function it calls is auth.uid().
drop view if exists public.business_public;
create view public.business_public with (security_invoker = false, security_barrier = true) as
  select distinct bp.id, bp.company_name, bp.business_type
  from public.business_profiles bp
  where exists (select 1 from public.jobs j where j.business_id = bp.id and j.status = 'published')
     or bp.user_id = auth.uid()
     or exists (select 1 from public.work_records w join public.cleaner_profiles cp on cp.id = w.cleaner_profile_id
                where w.business_id = bp.id and cp.user_id = auth.uid())
     or exists (select 1 from public.connections c join public.cleaner_profiles cp on cp.user_id = c.cleaner_id
                where c.household_id = bp.user_id and cp.user_id = auth.uid() and c.status = 'active')
     or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
revoke all on public.business_public from public, anon, authenticated;
grant select on public.business_public to anon, authenticated;

-- 3. business_profiles: owner (existing rule "own business profile") and admin only
drop policy if exists "public business display" on public.business_profiles;
drop policy if exists "admin reads business profiles" on public.business_profiles;
create policy "admin reads business profiles" on public.business_profiles for select using (public.is_admin());
-- anonymous visitors: no private columns. They keep select on id and user_id only, because the rules of other
-- tables (jobs, units, ...) look those two columns up as the visitor; row security still returns them no rows.
revoke all on public.business_profiles from anon;
grant select (id, user_id) on public.business_profiles to anon;
-- defence in depth: API roles never need these table-level rights (row security cannot guard TRUNCATE)
revoke truncate, references, trigger on public.business_profiles from authenticated;

-- 4. the Part 13 helper is no longer used by any rule
drop function if exists public.business_has_published_job(uuid);
