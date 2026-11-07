-- Check after loading the migrations on the TEST project. Every column must be true.
select
  exists (select 1 from pg_proc where proname = 'submit_job_quote')                                   as quotes,
  exists (select 1 from pg_proc where proname = 'erase_user_data')                                    as privacy,
  exists (select 1 from pg_proc where proname = 'answer_meeting_proposal')                            as meetings,
  exists (select 1 from pg_proc where proname = 'purge_old_records')                                  as retention,
  exists (select 1 from pg_policies where tablename = 'cleaner_profiles' and policyname = 'cleaner deletes own ad') as review_fixes,
  exists (select 1 from pg_proc where proname = 'cleaner_distances' and prosecdef)                    as distances_fixed,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_allowlist') as admin_allowlist,
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('profiles','cleaner_profiles','business_profiles','jobs','job_responses','messages','reports','reviews','settings')) = 9 as core_tables,
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef and p.proconfig is null)                      as search_path_fixed;
