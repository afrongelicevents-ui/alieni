-- Security review fixes (brief §7: run /security-review and fix findings).

-- ========== FINDING 1 (high): privilege escalation via profiles.role ==========
-- The original policies let any user insert or update their own profile row
-- with role 'admin', which is_admin() trusts. Lock the admin role so it can
-- only ever be granted manually (SQL console / service role).

drop policy "own profile insert" on profiles;
drop policy "own profile update" on profiles;

create policy "own profile insert" on profiles for insert
  with check (id = auth.uid() and role <> 'admin');

create policy "own profile update" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role <> 'admin');

-- Belt-and-braces: even a bugged future policy cannot flip role to admin.
create or replace function prevent_role_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and (old.role is distinct from 'admin') and not is_admin() then
    raise exception 'role escalation blocked';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before insert or update on profiles
  for each row execute function prevent_role_escalation();

-- ========== FINDING 2 (medium): verified_jobs_count tampering ==========
-- verified_jobs_count is the cleaner's trust metric and must only be
-- maintained by the system (incremented when a connection is mutually
-- confirmed), never self-edited.

create or replace function prevent_verified_count_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified_jobs_count is distinct from old.verified_jobs_count and not is_admin() then
    new.verified_jobs_count := old.verified_jobs_count;
  end if;
  return new;
end;
$$;

create trigger cleaner_profiles_protect_verified_count
  before update on cleaner_profiles
  for each row execute function prevent_verified_count_tamper();

-- System-side maintenance: count goes up when both parties confirm.
create or replace function bump_verified_jobs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and (old.household_confirmed_at is null or old.cleaner_confirmed_at is null) then
    update cleaner_profiles
      set verified_jobs_count = verified_jobs_count + 1
      where user_id = new.cleaner_id;
  end if;
  return new;
end;
$$;

create trigger connections_bump_verified_jobs
  after update on connections
  for each row execute function bump_verified_jobs();

-- ========== FINDING 3 (low): report flooding ==========
-- Edge rate limiting (brief §7) is the first line of defence; this database
-- cap is the backstop: max 10 reports per user per hour.
create or replace function check_report_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'report rate limit exceeded';
  end if;
  return new;
end;
$$;

create trigger reports_rate_limit
  before insert on reports
  for each row execute function check_report_rate();
