-- 0030 — alieni-nl ONLY: remove the features that are not part of the alieni-nl version of the site.
-- NOT APPLIED to any database. Review first. Destructive: it deletes the data of these features.
--
-- Removed:
--   * Airbnb/hotel calendar sync and turnovers  (cleaning_slots, iCal columns on business_units, turnover photos)
--   * Emergency cleaners and cover               (emergency_requests, cleaner_strikes, emergency rate/opt-in, cover rules)
--   * Linen & amenities                          (setting linen_addon)
--   * Coming-soon modules + Notify me            (module_interest, setting website_modules)
--   * Schools & childcare and VOG                (vog_documents, VOG files, setting vog_max_age_months, business type 'school')
--
-- Kept and updated where they referred to the removed parts:
--   erase_user_data (account deletion), guard_cleaner_profile_update, job_service_key, submit_job_quote.
--   cleaner_connected_to_business() and the view cleaner_slot_units stay: awarded jobs use them for the job address.
--
-- Two things SQL cannot do here (see the notes at the end):
--   * Postgres cannot drop a value from an enum: 'school' stays a label of type business_type, but no row may use it
--     any more (check constraints below). Rebuilding the type would also mean rebuilding a view and three functions.
--   * Supabase does not allow deleting stored files with SQL. Empty the storage buckets 'vog' and 'turnover-photos'
--     first (Dashboard → Storage, or the Storage API); this script then removes the empty buckets.

begin;

-- ========== 1. data of the removed features ==========
delete from public.settings where key in ('emergency_fee_cents', 'cover_rules', 'linen_addon', 'vog_max_age_months', 'website_modules');

-- services 'cover' (emergency & replacement) and 'turnover' (calendar turnovers)
delete from public.pricing_rules where service_key in ('cover', 'turnover');
delete from public.fee_events where service_key in ('cover', 'turnover') and status <> 'invoiced';
delete from public.work_records where service_key in ('cover', 'turnover');
delete from public.service_catalog where service_key in ('cover', 'turnover');

-- jobs posted "per checkout" (turnover jobs) are taken offline and become one-off jobs, so the stricter rule below fits
update public.jobs set status = 'removed', frequency = 'once' where frequency = 'per_checkout';

-- cleaners: no 'school' / 'emergency' environments and no turnover / emergency-cover work types
update public.cleaner_profiles
   set job_types = coalesce(nullif(array_remove(array_remove(job_types, 'school'), 'emergency'), '{}'), '{household}')
 where job_types && array['school', 'emergency'];
update public.cleaner_profiles
   set work_types = coalesce(nullif(array_remove(array_remove(work_types, 'turnover'), 'emergency_cover'), '{}'),
                             case when work_scope = 'household' then '{household_regular}'::text[] else '{commercial_contract}'::text[] end)
 where work_types && array['turnover', 'emergency_cover'];

-- schools: existing school accounts become 'office' (the closest remaining type); prices and service limits for schools go
update public.business_profiles set business_type = 'office' where business_type = 'school';
delete from public.pricing_rules where business_type = 'school';
update public.service_catalog set business_types = array_remove(business_types, 'school'::public.business_type)
 where 'school'::public.business_type = any (business_types);

-- the homepage/business photo slot for schools
delete from public.site_media where slot = 'business-school';

-- ========== 2. access rules outside the removed tables ==========
drop policy if exists "emergency parties see each other" on public.profiles;
drop policy if exists "cleaner uploads own vog" on storage.objects;
drop policy if exists "admin reads vog files" on storage.objects;
drop policy if exists "admin deletes vog files" on storage.objects;
drop policy if exists "cleaner uploads turnover photo" on storage.objects;
drop policy if exists "business and admin read turnover photos" on storage.objects;

-- ========== 3. functions that stay, without the removed parts ==========
create or replace function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
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

create or replace function public.job_service_key(p_frequency text) returns text
language sql immutable set search_path = ''
as $$ select case p_frequency when 'once' then 'oneoff' else 'contract' end; $$;

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
  return new;
end;
$$;

create or replace function public.submit_job_quote(p_job_id uuid, p_rate_cents integer, p_message text, p_valid_until date default null)
returns jsonb
language plpgsql security definer set search_path = ''
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

-- ========== 4. views, triggers, functions and tables of the removed features ==========
drop view if exists public.emergency_requests_open;
drop view if exists public.cleaner_vog_badges;

drop trigger if exists cleaning_slots_guard_cleaner_update on public.cleaning_slots;
drop trigger if exists cleaning_slots_work on public.cleaning_slots;
drop trigger if exists emergency_requests_rate_limit on public.emergency_requests;
drop trigger if exists emergency_requests_guard_update on public.emergency_requests;
drop trigger if exists emergency_requests_guard_insert on public.emergency_requests;
drop trigger if exists emergency_requests_work on public.emergency_requests;
drop trigger if exists vog_delete_file_after_review on public.vog_documents;
drop trigger if exists vog_documents_guard_write on public.vog_documents;

drop function if exists public.accept_emergency_request(uuid);
drop function if exists public.cancel_emergency_request(uuid, text);
drop function if exists public.report_emergency_attendance(uuid, boolean, text);
drop function if exists public.emergency_alert_targets(uuid);
drop function if exists public.expire_emergency_requests();
drop function if exists public.cleaner_eligible_for_request(public.cleaner_profiles, public.emergency_requests);
drop function if exists public.cover_rules();
drop function if exists public.check_emergency_rate();
drop function if exists public.guard_emergency_insert();
drop function if exists public.guard_emergency_update();
drop function if exists public.work_from_emergency();
drop function if exists public.work_from_cleaning_slot();
drop function if exists public.guard_cleaner_slot_update();
drop function if exists public.delete_vog_file_after_review();
drop function if exists public.guard_vog_write();
drop function if exists public.vog_is_valid(uuid);

drop table if exists public.cleaner_strikes;
drop table if exists public.emergency_requests;
drop table if exists public.cleaning_slots;
drop table if exists public.vog_documents;
drop table if exists public.module_interest;

drop type if exists public.emergency_status;
drop type if exists public.slot_status;
drop type if exists public.slot_source;
drop type if exists public.vog_status;

-- ========== 5. columns of the removed features ==========
alter table public.cleaner_profiles drop column if exists emergency_opt_in, drop column if exists emergency_rate_cents;
alter table public.business_units
  drop column if exists ical_url, drop column if exists ical_last_synced_at, drop column if exists ical_last_error,
  drop column if exists checkout_time, drop column if exists checkin_time;

-- ========== 6. rules: the removed values can no longer be stored ==========
alter table public.jobs drop constraint if exists jobs_frequency_check;
alter table public.jobs add constraint jobs_frequency_check check (frequency in ('once', 'daily', 'weekly', 'biweekly', 'monthly'));

alter table public.service_catalog drop constraint if exists service_catalog_service_key_check;
alter table public.service_catalog add constraint service_catalog_service_key_check check (service_key in ('connect', 'oneoff', 'contract'));

alter table public.cleaner_profiles drop constraint if exists cleaner_work_types_check;
alter table public.cleaner_profiles add constraint cleaner_work_types_check
  check (work_types <@ array['household_regular', 'move_in_out', 'deep', 'commercial_contract']);
alter table public.cleaner_profiles drop constraint if exists cleaner_job_types_check;
alter table public.cleaner_profiles add constraint cleaner_job_types_check
  check (job_types <@ array['household', 'airbnb', 'hotel', 'restaurant', 'office']);

alter table public.site_media drop constraint if exists site_media_slot_check;
alter table public.site_media add constraint site_media_slot_check
  check (slot in ('hero-cleaner', 'business-airbnb', 'business-hotel', 'business-restaurant', 'business-office'));

-- 'school' stays an enum label (Postgres cannot drop one) but may not be used
alter table public.business_profiles drop constraint if exists business_profiles_no_school;
alter table public.business_profiles add constraint business_profiles_no_school check (business_type is distinct from 'school');
alter table public.pricing_rules drop constraint if exists pricing_rules_no_school;
alter table public.pricing_rules add constraint pricing_rules_no_school check (business_type is distinct from 'school');
alter table public.service_catalog drop constraint if exists service_catalog_no_school;
alter table public.service_catalog add constraint service_catalog_no_school check (not ('school'::public.business_type = any (business_types)));

-- ========== 7. storage buckets (only when already emptied) ==========
do $$
declare b text;
begin
  foreach b in array array['vog', 'turnover-photos'] loop
    if exists (select 1 from storage.buckets where id = b) then
      if exists (select 1 from storage.objects where bucket_id = b) then
        raise notice 'Storage bucket % still holds files: empty it in the Dashboard (Storage) and run this block again.', b;
      else
        delete from storage.buckets where id = b;
      end if;
    end if;
  end loop;
end $$;

commit;
