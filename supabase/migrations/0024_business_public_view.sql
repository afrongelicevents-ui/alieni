-- Part 14: protect private company information.
-- Until now every signed-in user (and anyone holding the public key) could read these columns of a company
-- that has a published job: contact first/last name, VAT number, unit count, price, billing dates and the
-- payment-failed flag. The public jobs board only needs the company NAME and TYPE.
--   1. business_public: a restricted view with id, company_name, business_type only, for companies that
--      have a published job, plus companies the viewer works with (a cleaner's own work records or an
--      active connection) and the viewer's own company.
--   2. business_profiles is no longer readable by anyone except its owner and admins.
-- Additive: one function, one view, one rule replaced by two narrower ones. No data is touched.

-- who may see a company's public card
create or replace function business_public_visible(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select business_has_published_job(p_business_id)
    or exists (select 1 from business_profiles bp where bp.id = p_business_id and bp.user_id = auth.uid())
    or exists (select 1 from work_records w join cleaner_profiles cp on cp.id = w.cleaner_profile_id
               where w.business_id = p_business_id and cp.user_id = auth.uid())
    or cleaner_connected_to_business(p_business_id)
    or is_admin();
$$;
-- a view's functions are executed with the caller's rights, so the caller needs execute (it only answers yes/no for one id)
grant execute on function business_public_visible(uuid) to anon, authenticated;

-- the view runs with its owner's rights (it must read business_profiles), and exposes three columns only
drop view if exists business_public;
create view business_public with (security_invoker = false, security_barrier = true) as
  select id, company_name, business_type
  from business_profiles
  where business_public_visible(id);
revoke all on business_public from public, anon, authenticated;
grant select on business_public to anon, authenticated;

-- business_profiles: owner (existing rule "own business profile") and admin only
drop policy if exists "public business display" on business_profiles;
drop policy if exists "admin reads business profiles" on business_profiles;
create policy "admin reads business profiles" on business_profiles for select using (is_admin());
-- anonymous visitors: no access to private columns. They keep select on id and user_id only, because the rules of
-- other tables (jobs, units, ...) look those two columns up as the visitor; row security still returns them no rows.
revoke all on business_profiles from anon;
grant select (id, user_id) on business_profiles to anon;
