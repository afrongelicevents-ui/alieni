-- Fix: "infinite recursion detected in policy for relation business_profiles".
-- Since migration 0006 the access rule "public business display" on business_profiles read the jobs table,
-- and the rules on jobs read business_profiles, so Postgres refused to evaluate either of them. Every
-- business-side table that points at business_profiles was affected (units, jobs, job responses, calendar
-- slots, fee events, invoices, work records, billing periods).
-- The cross-check now goes through a small trusted function that reads jobs without re-entering the rules.
-- Behaviour is unchanged: a company's public details are visible while it has a published job.
-- Additive: one function, one rule replaced by an equivalent rule. No data is touched.

create or replace function business_has_published_job(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobs where business_id = p_business_id and status = 'published');
$$;
grant execute on function business_has_published_job(uuid) to anon, authenticated;

drop policy if exists "public business display" on business_profiles;
create policy "public business display" on business_profiles for select using (
  business_has_published_job(id) or is_admin()
);
