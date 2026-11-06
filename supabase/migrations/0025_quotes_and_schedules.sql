-- Part 15: quotations, one-off cleaning and regular cleaning schedules (services 'oneoff' and 'contract').
-- Builds on the existing jobs / job_responses / work_records tables; no new table.
--   1. a job can carry its schedule (weekdays, start time, hours, first and last date)
--   2. a response becomes a quotation: it has a status (sent / accepted / declined) and a validity date
--   3. the business accepts or declines a quotation; accepting awards the job, schedules the work and
--      records a fee event at the amount of the active pricing rule (EUR 0 while no rule is active)
--   4. a recurring job generates its visits (work records) four weeks ahead; the daily cron keeps them coming
--   5. either party can cancel an awarded job; future visits are cancelled
--   6. published jobs that pass their expiry date are closed
--   7. posting a job is only possible while its service is switched on in the catalogue
-- Nothing here charges anyone. Safe to run twice. Existing jobs and responses keep working.

-- ========== 1. job schedule and award ==========
alter table jobs
  add column if not exists weekdays smallint[] not null default '{}',
  add column if not exists visit_start time,
  add column if not exists visit_hours numeric(4,1),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists awarded_response_id uuid,
  add column if not exists awarded_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by text;
alter table jobs drop constraint if exists jobs_weekdays_check;
alter table jobs add constraint jobs_weekdays_check check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]);
alter table jobs drop constraint if exists jobs_visit_hours_check;
alter table jobs add constraint jobs_visit_hours_check check (visit_hours is null or (visit_hours >= 0.5 and visit_hours <= 24));
alter table jobs drop constraint if exists jobs_dates_check;
alter table jobs add constraint jobs_dates_check check (end_date is null or start_date is null or end_date >= start_date);
alter table jobs drop constraint if exists jobs_ended_by_check;
alter table jobs add constraint jobs_ended_by_check check (ended_by is null or ended_by in ('business', 'cleaner'));

-- ========== 2. responses are quotations ==========
alter table job_responses
  add column if not exists status text not null default 'sent',
  add column if not exists valid_until date,
  add column if not exists decided_at timestamptz;
alter table job_responses drop constraint if exists job_responses_status_check;
alter table job_responses add constraint job_responses_status_check check (status in ('sent', 'accepted', 'declined'));
-- existing responses stay open for another two weeks
update job_responses set valid_until = current_date + 14 where valid_until is null;

do $$ begin
  alter table jobs add constraint jobs_awarded_response_fk foreign key (awarded_response_id) references job_responses (id) on delete set null;
exception when duplicate_object then null; end $$;

alter table work_records add column if not exists job_id uuid references jobs (id) on delete set null;
create index if not exists work_records_job_idx on work_records (job_id);

-- the two services were switched off because they were not built; they are now
update service_catalog set enabled = true, updated_at = now() where service_key in ('oneoff', 'contract') and enabled = false;

-- ========== 3. which service a job belongs to ==========
create or replace function public.job_service_key(p_frequency text) returns text
language sql immutable set search_path = ''
as $$ select case p_frequency when 'once' then 'oneoff' when 'per_checkout' then 'turnover' else 'contract' end; $$;

-- ========== 4. guards ==========
-- same logic as before, but with an empty search_path and qualified names so it also works when a
-- hardened (empty search_path) function calls it
create or replace function public.alieni_is_system() returns boolean
language sql stable set search_path = ''
as $$ select auth.uid() is null or public.is_admin() or current_setting('alieni.system', true) = 'on'; $$;


-- posting a job: the business's own service must be on; a recurring job needs a start date
create or replace function public.guard_job_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare bt public.business_type;
begin
  select business_type into bt from public.business_profiles where id = new.business_id;
  if not public.service_enabled_for(public.job_service_key(new.frequency), bt) then
    raise exception 'service not available';
  end if;
  if new.frequency in ('daily', 'weekly', 'biweekly', 'monthly') and new.start_date is null then
    raise exception 'start date required';
  end if;
  if new.start_date is not null and new.start_date < current_date - 1 then
    raise exception 'start date in the past';
  end if;
  new.awarded_response_id := null; new.awarded_at := null; new.ended_at := null; new.ended_by := null;
  return new;
end;
$$;
drop trigger if exists jobs_guard_insert on jobs;
create trigger jobs_guard_insert before insert on jobs for each row execute function public.guard_job_insert();

-- award and end columns are written by the functions below only
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
  if old.status = 'filled' and (new.frequency, new.weekdays, new.visit_start, new.visit_hours, new.start_date, new.end_date, new.business_id)
     is distinct from (old.frequency, old.weekdays, old.visit_start, old.visit_hours, old.start_date, old.end_date, old.business_id) then
    raise exception 'job is awarded';
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_guard_update on jobs;
create trigger jobs_guard_update before update on jobs for each row execute function public.guard_job_update();

-- a response goes through submit_job_quote(); the table is not writable directly any more
drop policy if exists "cleaner responds" on job_responses;
drop policy if exists "cleaner withdraws response" on job_responses;
drop policy if exists "cleaner withdraws open quote" on job_responses;
create policy "cleaner withdraws open quote" on job_responses for delete using (
  status = 'sent' and exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
);
revoke insert, update on job_responses from authenticated, anon;

-- a cleaner can read the job they sent a quotation for (also after it is awarded or closed).
-- Security definer helper: a rule on jobs that read job_responses directly would loop with their rules.
create or replace function public.cleaner_quoted_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.job_responses r join public.cleaner_profiles cp on cp.id = r.cleaner_profile_id
    where r.job_id = p_job_id and cp.user_id = auth.uid()
  );
$$;
drop policy if exists "cleaner reads quoted job" on jobs;
create policy "cleaner reads quoted job" on jobs for select using (public.cleaner_quoted_job(id));

-- ========== 5. quotation functions ==========
-- A cleaner sends a quotation for a published job. Returns {result, business_user_id}.
create or replace function public.submit_job_quote(p_job_id uuid, p_rate_cents integer, p_message text, p_valid_until date default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  cp public.cleaner_profiles;
  j public.jobs;
  floor_cents integer := coalesce((select (value #>> '{}')::integer from public.settings where key = 'rate_floor_cents'), 1500);
  msg text := left(btrim(coalesce(p_message, '')), 1000);
  vu date := coalesce(p_valid_until, current_date + 14);
begin
  select * into cp from public.cleaner_profiles where user_id = auth.uid();
  if not found then return jsonb_build_object('result', 'no_ad'); end if;
  select * into j from public.jobs where id = p_job_id;
  if not found or j.status <> 'published' or (j.expires_at is not null and j.expires_at < now()) then
    return jsonb_build_object('result', 'not_available');
  end if;
  if p_rate_cents is null or p_rate_cents < floor_cents then return jsonb_build_object('result', 'rate'); end if;
  if msg = '' then return jsonb_build_object('result', 'message'); end if;
  if vu < current_date or vu > current_date + 90 then return jsonb_build_object('result', 'valid_until'); end if;
  if exists (select 1 from public.job_responses where job_id = p_job_id and cleaner_profile_id = cp.id) then
    return jsonb_build_object('result', 'already');
  end if;
  insert into public.job_responses (job_id, cleaner_profile_id, rate_cents, message, valid_until)
  values (p_job_id, cp.id, p_rate_cents, msg, vu);
  return jsonb_build_object('result', 'sent',
    'business_user_id', (select bp.user_id from public.business_profiles bp where bp.id = j.business_id));
end;
$$;
revoke execute on function public.submit_job_quote(uuid, integer, text, date) from public, anon;
grant execute on function public.submit_job_quote(uuid, integer, text, date) to authenticated;

-- Builds the visits (work records) of a recurring awarded job from today up to p_days_ahead. Idempotent.
create or replace function public.generate_job_visits(p_job_id uuid, p_days_ahead integer default 28)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs;
  r public.job_responses;
  d date; first_d date; last_d date;
  wd integer[];
  st time; hrs numeric; ok boolean; dom integer; added integer := 0; got integer;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found or j.status <> 'filled' or j.ended_at is not null or j.awarded_response_id is null then return 0; end if;
  if j.frequency not in ('daily', 'weekly', 'biweekly', 'monthly') or j.start_date is null then return 0; end if;
  select * into r from public.job_responses where id = j.awarded_response_id;
  if not found then return 0; end if;
  first_d := greatest(j.start_date, current_date);
  last_d := least(current_date + greatest(p_days_ahead, 1), coalesce(j.end_date, current_date + greatest(p_days_ahead, 1)));
  if first_d > last_d then return 0; end if;
  st := coalesce(j.visit_start, time '09:00');
  hrs := coalesce(j.visit_hours, 2);
  wd := case when cardinality(j.weekdays) = 0 then array[extract(isodow from j.start_date)::integer] else j.weekdays::integer[] end;
  dom := extract(day from j.start_date)::integer;
  for d in select g::date from generate_series(first_d::timestamp, last_d::timestamp, interval '1 day') g loop
    ok := case j.frequency
      when 'daily' then cardinality(j.weekdays) = 0 or extract(isodow from d)::integer = any (wd)
      when 'weekly' then extract(isodow from d)::integer = any (wd)
      when 'biweekly' then extract(isodow from d)::integer = any (wd)
        and ((((d - (extract(isodow from d)::integer - 1)) - (j.start_date - (extract(isodow from j.start_date)::integer - 1))) / 7) % 2 = 0)
      else d = least(make_date(extract(year from d)::integer, extract(month from d)::integer, dom),
                     (date_trunc('month', d::timestamp) + interval '1 month' - interval '1 day')::date)
    end;
    if ok then
      insert into public.work_records (business_id, cleaner_profile_id, service_key, reference_table, reference_id, job_id, scheduled_start, scheduled_end, outcome)
      values (j.business_id, r.cleaner_profile_id, 'contract', 'job_visits', md5(j.id::text || ':' || d::text)::uuid, j.id,
              (d + st) at time zone 'Europe/Amsterdam',
              ((d + st) at time zone 'Europe/Amsterdam') + make_interval(secs => (hrs * 3600)::double precision), 'scheduled')
      on conflict (reference_table, reference_id) do nothing;
      get diagnostics got = row_count;
      added := added + got;
      -- one billable moment per contract month (EUR 0 while no pricing rule is active)
      perform public.record_fee_event(j.business_id, 'contract', 'contract_month', 'jobs', md5(j.id::text || ':' || to_char(d, 'YYYY-MM'))::uuid);
    end if;
  end loop;
  return added;
end;
$$;
revoke execute on function public.generate_job_visits(uuid, integer) from public, anon, authenticated;

-- The business accepts a quotation: the job is awarded, other open quotations are declined, work is scheduled.
create or replace function public.accept_job_response(p_response_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.job_responses;
  j public.jobs;
  declined uuid[];
begin
  select * into r from public.job_responses where id = p_response_id;
  if not found then return jsonb_build_object('result', 'not_available'); end if;
  select * into j from public.jobs where id = r.job_id;
  if not exists (select 1 from public.business_profiles bp where bp.id = j.business_id and bp.user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  if j.status <> 'published' or r.status <> 'sent' then return jsonb_build_object('result', 'not_available'); end if;
  if r.valid_until is not null and r.valid_until < current_date then return jsonb_build_object('result', 'expired'); end if;
  perform set_config('alieni.system', 'on', true);
  update public.job_responses set status = 'accepted', decided_at = now() where id = r.id;
  select coalesce(array_agg(cp.user_id), '{}') into declined
    from public.job_responses o join public.cleaner_profiles cp on cp.id = o.cleaner_profile_id
    where o.job_id = j.id and o.id <> r.id and o.status = 'sent';
  update public.job_responses set status = 'declined', decided_at = now() where job_id = j.id and id <> r.id and status = 'sent';
  update public.jobs set status = 'filled', awarded_response_id = r.id, awarded_at = now() where id = j.id;
  if j.frequency = 'once' then
    insert into public.work_records (business_id, cleaner_profile_id, service_key, reference_table, reference_id, job_id, scheduled_start, scheduled_end, outcome)
    values (j.business_id, r.cleaner_profile_id, 'oneoff', 'jobs', j.id, j.id,
            case when j.start_date is not null then (j.start_date + coalesce(j.visit_start, time '09:00')) at time zone 'Europe/Amsterdam' end,
            case when j.start_date is not null then ((j.start_date + coalesce(j.visit_start, time '09:00')) at time zone 'Europe/Amsterdam')
                 + make_interval(secs => (coalesce(j.visit_hours, 2) * 3600)::double precision) end,
            'scheduled')
    on conflict (reference_table, reference_id) do nothing;
  end if;
  perform public.record_fee_event(j.business_id, public.job_service_key(j.frequency), 'quote_accepted', 'job_responses', r.id);
  perform public.generate_job_visits(j.id, 28);
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('result', 'accepted',
    'cleaner_user_id', (select cp.user_id from public.cleaner_profiles cp where cp.id = r.cleaner_profile_id),
    'declined_user_ids', to_jsonb(declined));
end;
$$;
revoke execute on function public.accept_job_response(uuid) from public, anon;
grant execute on function public.accept_job_response(uuid) to authenticated;

create or replace function public.decline_job_response(p_response_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.job_responses; j public.jobs;
begin
  select * into r from public.job_responses where id = p_response_id;
  if not found then return jsonb_build_object('result', 'not_available'); end if;
  select * into j from public.jobs where id = r.job_id;
  if not exists (select 1 from public.business_profiles bp where bp.id = j.business_id and bp.user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  if r.status <> 'sent' then return jsonb_build_object('result', 'not_available'); end if;
  update public.job_responses set status = 'declined', decided_at = now() where id = r.id;
  return jsonb_build_object('result', 'declined', 'cleaner_user_id', (select cp.user_id from public.cleaner_profiles cp where cp.id = r.cleaner_profile_id));
end;
$$;
revoke execute on function public.decline_job_response(uuid) from public, anon;
grant execute on function public.decline_job_response(uuid) to authenticated;

-- Either party cancels an awarded job. Future visits are cancelled; visits already done stay as they are.
create or replace function public.cancel_awarded_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs;
  r public.job_responses;
  biz_user uuid; cleaner_user uuid; actor text;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found or j.status <> 'filled' or j.ended_at is not null then return jsonb_build_object('result', 'not_available'); end if;
  select * into r from public.job_responses where id = j.awarded_response_id;
  select bp.user_id into biz_user from public.business_profiles bp where bp.id = j.business_id;
  select cp.user_id into cleaner_user from public.cleaner_profiles cp where cp.id = r.cleaner_profile_id;
  actor := case when biz_user = auth.uid() then 'business' when cleaner_user = auth.uid() then 'cleaner' end;
  if actor is null then return jsonb_build_object('result', 'not_allowed'); end if;
  perform set_config('alieni.system', 'on', true);
  update public.jobs set ended_at = now(), ended_by = actor where id = j.id;
  update public.work_records set outcome = 'cancelled', updated_at = now()
    where job_id = j.id and outcome = 'scheduled' and (scheduled_start is null or scheduled_start > now());
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('result', 'cancelled', 'by', actor, 'other_user_id', case when actor = 'business' then cleaner_user else biz_user end);
end;
$$;
revoke execute on function public.cancel_awarded_job(uuid) from public, anon;
grant execute on function public.cancel_awarded_job(uuid) to authenticated;

-- ========== 6. housekeeping (called by the daily cron with the service key) ==========
create or replace function public.expire_stale_jobs() returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform set_config('alieni.system', 'on', true);
  update public.jobs set status = 'expired' where status = 'published' and expires_at is not null and expires_at < now();
  get diagnostics n = row_count;
  perform set_config('alieni.system', 'off', true);
  return n;
end;
$$;
revoke execute on function public.expire_stale_jobs() from public, anon, authenticated;

create or replace function public.generate_all_job_visits(p_days_ahead integer default 28) returns integer
language plpgsql security definer set search_path = ''
as $$
declare j record; total integer := 0;
begin
  perform set_config('alieni.system', 'on', true);
  for j in select id from public.jobs where status = 'filled' and ended_at is null and frequency in ('daily', 'weekly', 'biweekly', 'monthly') loop
    total := total + public.generate_job_visits(j.id, p_days_ahead);
  end loop;
  perform set_config('alieni.system', 'off', true);
  return total;
end;
$$;
revoke execute on function public.generate_all_job_visits(integer) from public, anon, authenticated;

-- the cron job runs with the service key
grant execute on function public.generate_job_visits(uuid, integer), public.expire_stale_jobs(), public.generate_all_job_visits(integer) to service_role;
