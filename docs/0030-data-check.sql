-- Read-only: shows how much data migration 0030 would delete or change in a database.
-- Run it in Supabase → SQL Editor. It only reads; it changes nothing.
-- Run it BEFORE 0030 (afterwards most of these tables no longer exist).
select jsonb_pretty(jsonb_build_object(
  'tables that are dropped', jsonb_build_object(
    'emergency_requests', (select count(*) from public.emergency_requests),
    'cleaner_strikes',    (select count(*) from public.cleaner_strikes),
    'cleaning_slots',     (select count(*) from public.cleaning_slots),
    'vog_documents',      (select count(*) from public.vog_documents),
    'module_interest',    (select count(*) from public.module_interest)),
  'columns that are dropped (rows with a value)', jsonb_build_object(
    'cleaner_profiles emergency opt-in / rate', (select count(*) from public.cleaner_profiles where emergency_opt_in or emergency_rate_cents is not null),
    'business_units calendar link / times',     (select count(*) from public.business_units where ical_url is not null or ical_last_synced_at is not null or ical_last_error is not null or checkout_time is not null or checkin_time is not null)),
  'rows deleted or changed in tables that stay', jsonb_build_object(
    'settings rows deleted',                 (select coalesce(jsonb_agg(key), '[]'::jsonb) from public.settings where key in ('emergency_fee_cents', 'cover_rules', 'linen_addon', 'vog_max_age_months', 'website_modules')),
    'pricing_rules deleted (cover, turnover, school)', (select count(*) from public.pricing_rules where service_key in ('cover', 'turnover') or business_type = 'school'),
    'fee_events deleted (cover, turnover, not invoiced)', (select count(*) from public.fee_events where service_key in ('cover', 'turnover') and status <> 'invoiced'),
    'work_records deleted (cover, turnover)', (select count(*) from public.work_records where service_key in ('cover', 'turnover')),
    'service_catalog rows deleted',          (select count(*) from public.service_catalog where service_key in ('cover', 'turnover')),
    'per-checkout jobs taken offline',       (select count(*) from public.jobs where frequency = 'per_checkout'),
    'school businesses changed to office',   (select count(*) from public.business_profiles where business_type = 'school'),
    'cleaner ads with school/emergency/turnover types trimmed', (select count(*) from public.cleaner_profiles where job_types && array['school', 'emergency'] or work_types && array['turnover', 'emergency_cover']),
    'site_media school photo deleted',       (select count(*) from public.site_media where slot = 'business-school')),
  'storage', jsonb_build_object(
    'files in bucket vog',             (select count(*) from storage.objects where bucket_id = 'vog'),
    'files in bucket turnover-photos', (select count(*) from storage.objects where bucket_id = 'turnover-photos'))
)) as what_0030_would_touch;
