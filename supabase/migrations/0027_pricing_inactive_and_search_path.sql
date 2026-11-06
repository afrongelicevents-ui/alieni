-- Part 17: pricing stays inactive until a decision is made, and the older definer functions get a safer search_path.
--   1. the seeded household price and emergency booking fees are set to 0 (an admin sets a real price in Admin → Settings);
--      only values that still equal the original seed are changed, so a price an admin has set is never overwritten
--   2. accepting an emergency request records a fee of 0 when no price is configured (it used to fall back to the old seed)
--   3. every public security-definer function that had "search_path = public" now also lists pg_temp last, so a temporary
--      object can never shadow a table or function the function relies on
-- No table is added, no data is deleted. Safe to run twice.

-- ========== 1. no price until one is chosen ==========
update settings set value = '0'::jsonb where key = 'household_fee_cents' and value = '1495'::jsonb;
update settings set value = '{"household_incl_btw": 0, "business_excl_btw": 0}'::jsonb
  where key = 'emergency_fee_cents' and value = '{"household_incl_btw": 995, "business_excl_btw": 1495}'::jsonb;

-- ========== 2. accept: fee recorded at the configured amount, 0 when none ==========
create or replace function accept_emergency_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
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
          then coalesce((select (value ->> 'household_incl_btw')::integer from settings where key = 'emergency_fee_cents'), 0)
          else null end
    where id = p_request_id and status = 'searching' and window_start > now();
  get diagnostics updated = row_count;
  perform set_config('alieni.system', 'off', true);
  return updated = 1;
end;
$$;
revoke execute on function accept_emergency_request(uuid) from public, anon;
grant execute on function accept_emergency_request(uuid) to authenticated;

-- ========== 3. search_path: public, then pg_temp last ==========
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ========== 4. meetings: propose another time, answer a proposal, withdraw a request ==========
-- The cleaner may answer (accept / decline) or propose another time (status 'rescheduled' with the new day and part
-- of day); the household answers a proposal or withdraws its own request through the two functions below. Nobody
-- can change who the request is between, its type or its message.
create or replace function public.guard_meeting_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.alieni_is_system() then return new; end if;
  new.household_id := old.household_id; new.cleaner_profile_id := old.cleaner_profile_id;
  new.type := old.type; new.message := old.message; new.created_at := old.created_at;
  if new.status not in ('accepted', 'declined', 'rescheduled') or old.status = 'declined' then
    raise exception 'invalid meeting change';
  end if;
  if new.status <> 'rescheduled' then
    new.proposed_weekday := old.proposed_weekday; new.proposed_block := old.proposed_block;
  end if;
  new.responded_at := now();
  return new;
end;
$$;
drop trigger if exists meeting_requests_guard_update on meeting_requests;
create trigger meeting_requests_guard_update before update on meeting_requests
  for each row execute function public.guard_meeting_update();

-- the household accepts or declines the time the cleaner proposed. Returns the cleaner's user id on success.
create or replace function public.answer_meeting_proposal(p_request_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.meeting_requests; cleaner_user uuid;
begin
  select * into r from public.meeting_requests where id = p_request_id and household_id = auth.uid();
  if not found or r.status <> 'rescheduled' then return jsonb_build_object('result', 'not_allowed'); end if;
  select user_id into cleaner_user from public.cleaner_profiles where id = r.cleaner_profile_id;
  perform set_config('alieni.system', 'on', true);
  update public.meeting_requests set status = case when p_accept then 'accepted' else 'declined' end::public.meeting_status, responded_at = now() where id = r.id;
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('result', case when p_accept then 'accepted' else 'declined' end, 'cleaner_user_id', cleaner_user);
end;
$$;
revoke execute on function public.answer_meeting_proposal(uuid, boolean) from public, anon;
grant execute on function public.answer_meeting_proposal(uuid, boolean) to authenticated;

-- the household withdraws its own open request (it is recorded as declined)
create or replace function public.withdraw_meeting_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.meeting_requests; cleaner_user uuid;
begin
  select * into r from public.meeting_requests where id = p_request_id and household_id = auth.uid();
  if not found or r.status not in ('requested', 'accepted', 'rescheduled') then return jsonb_build_object('result', 'not_allowed'); end if;
  select user_id into cleaner_user from public.cleaner_profiles where id = r.cleaner_profile_id;
  perform set_config('alieni.system', 'on', true);
  update public.meeting_requests set status = 'declined', responded_at = now() where id = r.id;
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('result', 'withdrawn', 'cleaner_user_id', cleaner_user);
end;
$$;
revoke execute on function public.withdraw_meeting_request(uuid) from public, anon;
grant execute on function public.withdraw_meeting_request(uuid) to authenticated;

-- ========== 5. a cleaner can only open a deal with someone they already talk to ==========
drop policy if exists "cleaner creates connection" on connections;
create policy "cleaner creates connection" on connections for insert
  with check (
    cleaner_id = auth.uid()
    and exists (select 1 from conversations c where c.household_id = connections.household_id and c.cleaner_id = auth.uid())
  );

-- ========== 6. retention: old chats and handled reports are removed (service key, daily cron) ==========
create or replace function public.purge_old_records() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c integer; r integer;
begin
  perform set_config('alieni.system', 'on', true);
  delete from public.conversations cv
    where coalesce(cv.last_message_at, cv.created_at) < now() - interval '2 years'
      and not exists (select 1 from public.connections cn where cn.household_id = cv.household_id and cn.cleaner_id = cv.cleaner_id and cn.status = 'active');
  get diagnostics c = row_count;
  delete from public.reports where status <> 'open' and coalesce(resolved_at, created_at) < now() - interval '2 years';
  get diagnostics r = row_count;
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('conversations', c, 'reports', r);
end;
$$;
revoke execute on function public.purge_old_records() from public, anon, authenticated;
grant execute on function public.purge_old_records() to service_role;

-- ========== 7. reviews can be hidden by an admin (a reported review is no longer public) ==========
alter table reviews add column if not exists hidden boolean not null default false;
drop policy if exists "reviews are public" on reviews;
create policy "reviews are public" on reviews for select using (not hidden or is_admin() or author_id = auth.uid());
drop policy if exists "admin moderates reviews" on reviews;
create policy "admin moderates reviews" on reviews for update using (is_admin()) with check (is_admin());

-- ========== 8. turnovers are for rentals and hotels ==========
update service_catalog set business_types = '{airbnb,hotel}' where service_key = 'turnover' and business_types = '{}';

-- ========== 9. school jobs: only cleaners with a valid VOG can send a quotation ==========
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
  if exists (select 1 from public.business_profiles bp where bp.id = j.business_id and bp.business_type = 'school')
     and not public.vog_is_valid(cp.id) then
    return jsonb_build_object('result', 'vog_required');
  end if;
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

-- ========== 10. the awarded cleaner can read where to go (name and address of the job's location) ==========
create or replace view public.cleaner_slot_units with (security_barrier = true) as
  select distinct u.id, u.business_id, u.name, u.address_line, u.postcode, u.city
  from public.business_units u
  where public.cleaner_connected_to_business(u.business_id)
     or exists (
       select 1 from public.jobs j
       join public.job_responses r on r.id = j.awarded_response_id
       join public.cleaner_profiles cp on cp.id = r.cleaner_profile_id
       where j.unit_id = u.id and j.ended_at is null and cp.user_id = auth.uid()
     );
revoke all on public.cleaner_slot_units from public, anon, authenticated;
grant select on public.cleaner_slot_units to anon, authenticated;
