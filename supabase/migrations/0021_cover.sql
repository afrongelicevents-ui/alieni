-- Business side, Phase 2: emergency & replacement cover, complete.
--   1. request details: location from a unit, report-to, cover for a chosen day
--   2. cancellation window + "did the cleaner come?" (attendance)
--   3. strikes: no-show = fee waived + strike; too many strikes = opt-in removed
--   4. matching: opted-in cleaners with the right scope, within their travel radius
-- Purely additive. Nothing here charges anyone; fee events keep following the pricing rules.

-- ========== 1. request details ==========
alter table emergency_requests
  add column if not exists unit_id uuid references business_units (id) on delete set null,
  add column if not exists report_to text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists attendance text not null default 'unknown',
  add column if not exists attendance_at timestamptz,
  add column if not exists attendance_note text;
alter table emergency_requests drop constraint if exists emergency_attendance_check;
alter table emergency_requests add constraint emergency_attendance_check check (attendance in ('unknown', 'came', 'no_show'));

-- configurable rules (Admin → Settings)
insert into settings (key, value) values ('cover_rules', '{"cancel_window_hours": 4, "strike_limit": 2, "max_days_ahead": 14}')
on conflict (key) do nothing;

create or replace function cover_rules() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from settings where key = 'cover_rules'), '{"cancel_window_hours": 4, "strike_limit": 2, "max_days_ahead": 14}'::jsonb);
$$;

-- a business may only attach its own unit
create or replace function guard_emergency_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unit_id is not null and not exists (
    select 1 from business_units u join business_profiles bp on bp.id = u.business_id
    where u.id = new.unit_id and bp.user_id = new.requester_id
  ) then
    raise exception 'unit does not belong to the requester';
  end if;
  if new.window_start > now() + ((cover_rules() ->> 'max_days_ahead')::integer + 1) * interval '1 day' then
    raise exception 'too far ahead';
  end if;
  return new;
end;
$$;
drop trigger if exists emergency_requests_guard_insert on emergency_requests;
create trigger emergency_requests_guard_insert
  before insert on emergency_requests
  for each row execute function guard_emergency_insert();

-- ========== 2. strikes ==========
create table if not exists cleaner_strikes (
  id uuid primary key default gen_random_uuid(),
  cleaner_profile_id uuid not null references cleaner_profiles (id) on delete cascade,
  request_id uuid references emergency_requests (id) on delete set null,
  reason text not null default 'no_show',
  created_at timestamptz not null default now(),
  unique (request_id)
);
alter table cleaner_strikes enable row level security;
create policy "cleaner reads own strikes" on cleaner_strikes for select
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
create policy "admin reads strikes" on cleaner_strikes for select using (is_admin());
create policy "admin removes strikes" on cleaner_strikes for delete using (is_admin());
-- no insert policy: written by report_emergency_attendance() only

-- ========== 3. matching: scope + travel radius ==========
create or replace function cleaner_eligible_for_request(cp cleaner_profiles, r emergency_requests) returns boolean
language sql stable as $$
  select cp.emergency_opt_in
    and (r.requester_type = 'household' or coalesce(cp.work_scope, 'household') <> 'household')
    and (r.location is null or cp.location is null or st_dwithin(r.location, cp.location, cp.radius_km * 1000));
$$;

drop view if exists emergency_requests_open;
create view emergency_requests_open as
  select r.id, r.requester_type, left(r.postcode, 4) as postcode, r.city, r.window_start, r.window_end, r.hours, r.tasks, r.created_at
  from emergency_requests r
  where r.status = 'searching'
    and r.window_start > now()
    and exists (select 1 from cleaner_profiles cp where cp.user_id = auth.uid() and cleaner_eligible_for_request(cp, r));
grant select on emergency_requests_open to authenticated;

-- accept: same eligibility as the view; the fixed household fee stays, businesses follow the pricing rules
create or replace function accept_emergency_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  cp cleaner_profiles;
  r emergency_requests;
  updated integer;
begin
  select * into cp from cleaner_profiles where user_id = auth.uid() and emergency_opt_in;
  if not found then return false; end if;
  select * into r from emergency_requests where id = p_request_id;
  if not found or not cleaner_eligible_for_request(cp, r) then return false; end if;
  perform set_config('alieni.system', 'on', true);
  update emergency_requests
    set status = 'accepted', accepted_by = cp.id, accepted_at = now(),
        fee_cents = case when requester_type = 'household'
          then coalesce((select (value ->> 'household_incl_btw')::integer from settings where key = 'emergency_fee_cents'), 995)
          else null end
    where id = p_request_id and status = 'searching' and window_start > now();
  get diagnostics updated = row_count;
  perform set_config('alieni.system', 'off', true);
  return updated = 1;
end;
$$;

-- ========== 4. cancellation window ==========
-- Returns 'cancelled_free' (outside the window: any fee event is waived),
-- 'cancelled_late' (inside the window: the fee event stays), or 'not_allowed'.
create or replace function cancel_emergency_request(p_request_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r emergency_requests;
  win integer := (cover_rules() ->> 'cancel_window_hours')::integer;
  late boolean;
begin
  select * into r from emergency_requests where id = p_request_id and requester_id = auth.uid();
  if not found or r.status not in ('searching', 'accepted') then return 'not_allowed'; end if;
  late := r.status = 'accepted' and now() > r.window_start - make_interval(hours => win);
  perform set_config('alieni.system', 'on', true);
  update emergency_requests
    set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(left(p_reason, 300), '')
    where id = p_request_id;
  if not late then
    update fee_events set status = 'waived', waived_reason = 'cancelled outside the window'
      where reference_table = 'emergency_requests' and reference_id = p_request_id and status = 'pending';
  end if;
  perform set_config('alieni.system', 'off', true);
  return case when late then 'cancelled_late' else 'cancelled_free' end;
end;
$$;
grant execute on function cancel_emergency_request(uuid, text) to authenticated;

-- ========== 5. "did the cleaner come?" ==========
-- came → work record done and confirmed. no-show → fee waived, work record 'no_show',
-- a strike for the cleaner; at the strike limit the emergency opt-in is switched off.
create or replace function report_emergency_attendance(p_request_id uuid, p_came boolean, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r emergency_requests;
  lim integer := (cover_rules() ->> 'strike_limit')::integer;
  n integer;
begin
  select * into r from emergency_requests where id = p_request_id and requester_id = auth.uid();
  if not found or r.status <> 'accepted' or r.accepted_by is null or now() < r.window_start then return false; end if;
  if r.attendance <> 'unknown' then return false; end if;
  perform set_config('alieni.system', 'on', true);
  update emergency_requests
    set attendance = case when p_came then 'came' else 'no_show' end, attendance_at = now(), attendance_note = nullif(left(p_note, 500), '')
    where id = p_request_id;
  if p_came then
    update work_records set outcome = 'done', completed_at = coalesce(completed_at, now()), business_confirmed_at = now(), updated_at = now()
      where reference_table = 'emergency_requests' and reference_id = p_request_id;
  else
    update work_records set outcome = 'no_show', business_confirmed_at = now(), notes = coalesce(nullif(left(p_note, 500), ''), notes), updated_at = now()
      where reference_table = 'emergency_requests' and reference_id = p_request_id;
    update fee_events set status = 'waived', waived_reason = 'no-show'
      where reference_table = 'emergency_requests' and reference_id = p_request_id and status = 'pending';
    insert into cleaner_strikes (cleaner_profile_id, request_id, reason) values (r.accepted_by, p_request_id, 'no_show')
      on conflict (request_id) do nothing;
    select count(*) into n from cleaner_strikes where cleaner_profile_id = r.accepted_by;
    if n >= lim then
      update cleaner_profiles set emergency_opt_in = false, updated_at = now() where id = r.accepted_by;
    end if;
  end if;
  perform set_config('alieni.system', 'off', true);
  return true;
end;
$$;
grant execute on function report_emergency_attendance(uuid, boolean, text) to authenticated;
