-- Part 16: hardening and gaps found by the full backend audit. Purely additive or tightening; no data is deleted.
--   1. the two read-only helper views can no longer be written through the API
--   2. a cleaner cannot approve their own VOG
--   3. emergency requests: a forged "accepted" row, moved windows, early no-shows and erasing an accepted request are refused;
--      removed / hidden / draft ads and cleaners at the strike limit cannot take emergency work
--   4. moderation sticks: an ad hidden or removed by an admin stays that way until an admin restores it
--   5. a conversation's members cannot be swapped by one of its members
--   6. the public trust counter counts a connection once, however often it is re-opened
--   7. connected cleaners see where to go for a turnover (name and address only, never the calendar link)
--   8. pricing rules that are not active are not public
--   9. no price is copied into a business at its first deal (pricing stays under the pricing rules)
--  10. turnover photos get the same size and type limits as the other buckets
--  11. a cleaner's full postcode, exact location and KvK number are no longer public: only the 4-digit area is
-- Safe to run twice.

-- ========== 1. helper views are read-only ==========
revoke insert, update, delete, truncate on public.cleaner_vog_badges from anon, authenticated;
revoke insert, update, delete, truncate on public.emergency_requests_open from anon, authenticated;

-- ========== 2. VOG: the cleaner uploads and withdraws; only an admin approves or rejects ==========
drop policy if exists "cleaner manages own vog" on vog_documents;
drop policy if exists "cleaner reads own vog" on vog_documents;
create policy "cleaner reads own vog" on vog_documents for select
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
drop policy if exists "cleaner submits own vog" on vog_documents;
create policy "cleaner submits own vog" on vog_documents for insert
  with check (status = 'pending' and exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
drop policy if exists "cleaner resubmits own vog" on vog_documents;
create policy "cleaner resubmits own vog" on vog_documents for update
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()))
  with check (status = 'pending' and exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
drop policy if exists "cleaner withdraws own vog" on vog_documents;
create policy "cleaner withdraws own vog" on vog_documents for delete
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));

create or replace function public.guard_vog_write() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then return new; end if;
  new.reviewed_at := null; new.reviewed_by := null;
  return new;
end;
$$;
drop trigger if exists vog_documents_guard_write on vog_documents;
create trigger vog_documents_guard_write before insert or update on vog_documents
  for each row execute function public.guard_vog_write();

-- ========== 3. emergency requests ==========
drop policy if exists "requester manages own request" on emergency_requests;
drop policy if exists "requester reads own request" on emergency_requests;
create policy "requester reads own request" on emergency_requests for select using (requester_id = auth.uid());
drop policy if exists "requester creates own request" on emergency_requests;
create policy "requester creates own request" on emergency_requests for insert with check (requester_id = auth.uid());
drop policy if exists "requester updates own request" on emergency_requests;
create policy "requester updates own request" on emergency_requests for update using (requester_id = auth.uid()) with check (requester_id = auth.uid());
drop policy if exists "requester deletes unanswered request" on emergency_requests;
create policy "requester deletes unanswered request" on emergency_requests for delete
  using (requester_id = auth.uid() and status in ('searching', 'cancelled', 'expired'));

create or replace function public.guard_emergency_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then return new; end if;
  if new.unit_id is not null and not exists (
    select 1 from public.business_units u join public.business_profiles bp on bp.id = u.business_id
    where u.id = new.unit_id and bp.user_id = new.requester_id
  ) then
    raise exception 'unit does not belong to the requester';
  end if;
  if new.window_start > now() + ((public.cover_rules() ->> 'max_days_ahead')::integer + 1) * interval '1 day' then
    raise exception 'too far ahead';
  end if;
  if new.window_start <= now() or new.window_end <= new.window_start then
    raise exception 'window in the past';
  end if;
  new.status := 'searching'; new.accepted_by := null; new.accepted_at := null; new.fee_cents := null; new.mollie_payment_id := null;
  new.attendance := 'unknown'; new.attendance_at := null; new.attendance_note := null; new.cancelled_at := null; new.cancel_reason := null;
  return new;
end;
$$;

create or replace function public.guard_emergency_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then return new; end if;
  new.accepted_by := old.accepted_by; new.accepted_at := old.accepted_at; new.fee_cents := old.fee_cents;
  new.mollie_payment_id := old.mollie_payment_id; new.requester_id := old.requester_id;
  new.attendance := old.attendance; new.attendance_at := old.attendance_at; new.attendance_note := old.attendance_note;
  new.cancelled_at := old.cancelled_at; new.cancel_reason := old.cancel_reason;
  if old.status <> 'searching' then
    new.window_start := old.window_start; new.window_end := old.window_end; new.hours := old.hours;
  end if;
  if new.status is distinct from old.status and not (old.status = 'searching' and new.status = 'cancelled') then
    raise exception 'invalid emergency status change';
  end if;
  return new;
end;
$$;

-- a cleaner needs a live ad and must be under the strike limit (same shape as before: no extra schema needed)
create or replace function cleaner_eligible_for_request(cp cleaner_profiles, r emergency_requests) returns boolean
language sql stable as $$
  select cp.status = 'published' and cp.emergency_opt_in
    and (select count(*) from cleaner_strikes s where s.cleaner_profile_id = cp.id) < coalesce((cover_rules() ->> 'strike_limit')::integer, 2)
    and (r.requester_type = 'household' or coalesce(cp.work_scope, 'household') <> 'household')
    and (r.location is null or cp.location is null or st_dwithin(r.location, cp.location, cp.radius_km * 1000));
$$;

-- accept uses the same eligibility (so a removed or struck cleaner cannot take the job by calling the function directly)
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

-- cancelling is not possible once the cleaner has been marked as present or absent
create or replace function cancel_emergency_request(p_request_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r emergency_requests;
  win integer := (cover_rules() ->> 'cancel_window_hours')::integer;
  late boolean;
begin
  select * into r from emergency_requests where id = p_request_id and requester_id = auth.uid();
  if not found or r.status not in ('searching', 'accepted') or r.attendance <> 'unknown' then return 'not_allowed'; end if;
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

-- "came" from the start of the window; "no-show" only half an hour after it
create or replace function report_emergency_attendance(p_request_id uuid, p_came boolean, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r emergency_requests;
  lim integer := (cover_rules() ->> 'strike_limit')::integer;
  n integer;
begin
  select * into r from emergency_requests where id = p_request_id and requester_id = auth.uid();
  if not found or r.status <> 'accepted' or r.accepted_by is null or now() < r.window_start then return false; end if;
  if not p_came and now() < r.window_start + interval '30 minutes' then return false; end if;
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

-- ========== 4. moderation sticks; strikes cannot be undone by re-saving the ad ==========
alter table cleaner_profiles add column if not exists moderated boolean not null default false;
update cleaner_profiles set moderated = true where status = 'removed' and not moderated;

create or replace function public.guard_cleaner_profile_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then
    -- an admin changing the visibility marks (or clears) the moderation flag
    if auth.uid() is not null and public.is_admin() and new.status is distinct from old.status then
      new.moderated := new.status in ('hidden', 'removed');
    end if;
    return new;
  end if;
  new.user_id := old.user_id;
  new.moderated := old.moderated;
  if old.moderated then
    new.status := old.status;
  elsif new.status not in ('draft', 'published', 'hidden') then
    new.status := old.status; -- 'removed' is admin-only
  end if;
  -- the emergency opt-in stays off at the strike limit
  if new.emergency_opt_in and (select count(*) from public.cleaner_strikes s where s.cleaner_profile_id = new.id)
       >= coalesce((public.cover_rules() ->> 'strike_limit')::integer, 2) then
    new.emergency_opt_in := false;
  end if;
  return new;
end;
$$;

-- ========== 5. conversations: members are fixed once created ==========
create or replace function public.guard_conversation_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.alieni_is_system() then return new; end if;
  new.household_id := old.household_id; new.cleaner_id := old.cleaner_id; new.checkin_sent_at := old.checkin_sent_at;
  return new;
end;
$$;
drop trigger if exists conversations_guard_update on conversations;
create trigger conversations_guard_update before update on conversations
  for each row execute function public.guard_conversation_update();

-- ========== 6. trust counter: one count per connection ==========
alter table connections add column if not exists first_activated_at timestamptz;
update connections set first_activated_at = coalesce(started_at, created_at) where first_activated_at is null and status in ('active', 'ended');

create or replace function activate_connection_when_both_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and new.status = 'pending' then
    new.status := 'active';
    new.started_at := coalesce(new.started_at, now());
    if new.first_activated_at is null then
      new.first_activated_at := now();
      perform set_config('alieni.system', 'on', true);
      update cleaner_profiles set verified_jobs_count = verified_jobs_count + 1
        where user_id = new.cleaner_id;
      perform set_config('alieni.system', 'off', true);
    end if;
  end if;
  return new;
end;
$$;

-- ========== 7. where to go: connected cleaners read a unit's name and address, never its calendar link ==========
create or replace view public.cleaner_slot_units with (security_barrier = true) as
  select distinct u.id, u.business_id, u.name, u.address_line, u.postcode, u.city
  from public.business_units u
  where public.cleaner_connected_to_business(u.business_id);
revoke all on public.cleaner_slot_units from public, anon, authenticated;
grant select on public.cleaner_slot_units to anon, authenticated;

-- ========== 8. only active pricing rules are public ==========
drop policy if exists "rules are readable" on pricing_rules;
drop policy if exists "active rules are readable" on pricing_rules;
create policy "active rules are readable" on pricing_rules for select using (active or is_admin());

-- ========== 9. the first deal no longer copies a price into the business ==========
create or replace function start_business_billing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bp business_profiles;
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and (old.household_confirmed_at is null or old.cleaner_confirmed_at is null) then
    select * into bp from business_profiles where user_id = new.household_id;
    if found and bp.billing_started_at is null and bp.business_type is not null then
      update business_profiles set billing_started_at = now() where id = bp.id;
    end if;
  end if;
  return new;
end;
$$;

-- ========== 10. turnover photos: size and type limits ==========
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'turnover-photos';

-- ========== 11. a cleaner's home is not public ==========
-- Everyone can read a published ad, but not the full postcode, the exact point or the KvK number. The public
-- sees the 4-digit area; distances come from cleaner_distances(). The owner reads their own postcode through
-- my_cleaner_postcode(). Columns added to cleaner_profiles later need their own "grant select (...)" for the API roles.
alter table cleaner_profiles add column if not exists postcode_area text generated always as (left(postcode, 4)) stored;

create or replace function public.my_cleaner_postcode() returns text
language sql stable security definer set search_path = ''
as $$ select postcode from public.cleaner_profiles where user_id = auth.uid(); $$;
revoke execute on function public.my_cleaner_postcode() from public, anon;
grant execute on function public.my_cleaner_postcode() to authenticated;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'cleaner_profiles' and column_name not in ('postcode', 'location', 'kvk_number');
  revoke select on public.cleaner_profiles from anon, authenticated;
  execute format('grant select (%s) on public.cleaner_profiles to anon, authenticated', cols);
end $$;

-- ========== 12. emergency alerts: who should be told about a new request (service key only) ==========
create or replace function public.emergency_alert_targets(p_request_id uuid) returns table (user_id uuid)
language sql stable security definer set search_path = public
as $$
  select cp.user_id
  from public.cleaner_profiles cp
  join public.emergency_requests r on r.id = p_request_id
  where r.status = 'searching' and public.cleaner_eligible_for_request(cp, r)
  order by cp.verified_jobs_count desc
  limit 25;
$$;
revoke execute on function public.emergency_alert_targets(uuid) from public, anon, authenticated;
grant execute on function public.emergency_alert_targets(uuid) to service_role;

-- ========== 13. erasing an account (called by the server with the service key) ==========
-- Removes the person's content. Invoices and payments stay where the law requires it; then the account row is
-- anonymised instead of deleted. Returns {"keep_account": true} when the login row has to stay (it is then
-- disabled by the server), false when it can be deleted outright.
create or replace function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  bp uuid;
  retained boolean;
begin
  perform set_config('alieni.system', 'on', true);
  delete from favourites where user_id = p_user;
  delete from meeting_requests where household_id = p_user or cleaner_profile_id in (select id from cleaner_profiles where user_id = p_user);
  delete from conversations where household_id = p_user or cleaner_id = p_user;
  delete from connections where household_id = p_user or cleaner_id = p_user;
  delete from emergency_requests where requester_id = p_user;
  delete from reviews where author_id = p_user or subject_id = p_user;
  delete from household_profiles where user_id = p_user;
  delete from cleaner_profiles where user_id = p_user;
  retained := exists (select 1 from invoices where household_id = p_user) or exists (select 1 from payments where household_id = p_user);
  select id into bp from business_profiles where user_id = p_user;
  if bp is not null then
    if exists (select 1 from invoices where business_id = bp) or exists (select 1 from business_billing_periods where business_id = bp) then
      update business_profiles set company_name = 'Verwijderd bedrijf', kvk_number = null, btw_number = null,
        contact_first_name = null, contact_last_name = null, billing_ended_at = coalesce(billing_ended_at, now())
        where id = bp;
      delete from business_units where business_id = bp;
      delete from jobs where business_id = bp;
      retained := true;
    else
      delete from business_profiles where id = bp;
    end if;
  end if;
  update profiles set display_name = 'Verwijderde gebruiker', city = null, mollie_customer_id = null where id = p_user;
  perform set_config('alieni.system', 'off', true);
  return jsonb_build_object('keep_account', retained);
end;
$$;
revoke execute on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;

-- ========== 14. turnover slots can be released or cancelled ==========
-- The cleaner who reserved a slot may give it back before it starts; the business may cancel a slot or re-open it.
create or replace function guard_cleaner_slot_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select id from cleaner_profiles where user_id = auth.uid());
  is_business boolean := exists (select 1 from business_profiles bp where bp.id = new.business_id and bp.user_id = auth.uid());
begin
  if is_business or is_admin() or auth.uid() is null then
    return new; -- business owner, admin, or service role
  end if;
  -- immutable fields for cleaners
  if new.unit_id <> old.unit_id or new.business_id <> old.business_id
     or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at
     or new.slot_date <> old.slot_date or new.source <> old.source then
    raise exception 'slot details are read-only for cleaners';
  end if;
  if old.status = 'open' and new.status = 'reserved' and new.reserved_by = me then
    new.reserved_at := now();
    return new;
  end if;
  if old.status = 'reserved' and old.reserved_by = me and new.status = 'done' and new.reserved_by = me then
    new.done_at := coalesce(new.done_at, now());
    return new;
  end if;
  if old.status = 'reserved' and old.reserved_by = me and new.status = 'open' and new.reserved_by is null and old.starts_at > now() then
    new.reserved_at := null; new.reminder_sent_at := null;
    return new;
  end if;
  raise exception 'invalid slot transition';
end;
$$;

create or replace function work_from_cleaning_slot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'reserved' and (old.status is distinct from 'reserved') then
    insert into work_records (business_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, outcome)
    values (new.business_id, new.reserved_by, 'turnover', 'cleaning_slots', new.id, new.starts_at, new.ends_at, 'scheduled')
    on conflict (reference_table, reference_id) do update
      set cleaner_profile_id = excluded.cleaner_profile_id, outcome = 'scheduled', updated_at = now();
  elsif new.status = 'done' and (old.status is distinct from 'done') then
    insert into work_records (business_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, completed_at, photo_path, outcome)
    values (new.business_id, new.reserved_by, 'turnover', 'cleaning_slots', new.id, new.starts_at, new.ends_at, coalesce(new.done_at, now()), new.done_photo_path, 'done')
    on conflict (reference_table, reference_id) do update
      set completed_at = excluded.completed_at, photo_path = excluded.photo_path, outcome = 'done', updated_at = now();
    perform record_fee_event(new.business_id, 'turnover', 'turnover_completed', 'cleaning_slots', new.id);
  elsif new.status = 'cancelled' and (old.status is distinct from 'cancelled') then
    update work_records set outcome = 'cancelled', updated_at = now() where reference_table = 'cleaning_slots' and reference_id = new.id and outcome = 'scheduled';
  elsif new.status = 'open' and old.status = 'reserved' then
    -- given back or re-opened: the old cleaner's scheduled work goes away, a new reservation creates a fresh one
    update work_records set outcome = 'cancelled', updated_at = now() where reference_table = 'cleaning_slots' and reference_id = new.id and outcome = 'scheduled';
  end if;
  return new;
end;
$$;

-- the row a cleaner leaves behind when giving a slot back has no reservation; the guard trigger decides what is allowed
drop policy if exists "connected cleaner reserves or completes" on cleaning_slots;
create policy "connected cleaner reserves or completes" on cleaning_slots for update
  using (
    cleaner_connected_to_business(business_id)
    and (status = 'open' or reserved_by = (select id from cleaner_profiles where user_id = auth.uid()))
  )
  with check (
    reserved_by is null or reserved_by = (select id from cleaner_profiles where user_id = auth.uid())
  );

-- ========== 15. signed-in-only functions are not callable without signing in ==========
revoke execute on function accept_emergency_request(uuid), cancel_emergency_request(uuid, text), report_emergency_attendance(uuid, boolean, text),
  review_work_record(uuid, boolean, text), progress_work_record(uuid, text) from public, anon;
grant execute on function accept_emergency_request(uuid), cancel_emergency_request(uuid, text), report_emergency_attendance(uuid, boolean, text),
  review_work_record(uuid, boolean, text), progress_work_record(uuid, text) to authenticated;
