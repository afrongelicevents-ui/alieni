-- Probes run on the scratch database after all migrations are loaded.
create temp table probe_users (role text primary key, uid uuid);
insert into admin_allowlist (email) values ('admin@probe.test') on conflict do nothing;
insert into auth.users (email, raw_user_meta_data) values
  ('hh@probe.test',    '{"role":"household","display_name":"HH"}'),
  ('cl@probe.test',    '{"role":"cleaner","display_name":"CL"}'),
  ('biz@probe.test',   '{"role":"business","display_name":"BIZ"}'),
  ('admin@probe.test', '{"role":"household","display_name":"ADMIN"}');
insert into probe_users select 'household', id from auth.users where email = 'hh@probe.test';
insert into probe_users select 'cleaner',   id from auth.users where email = 'cl@probe.test';
insert into probe_users select 'business',  id from auth.users where email = 'biz@probe.test';
insert into probe_users select 'admin',     id from auth.users where email = 'admin@probe.test';
grant all on probe_users to public;

create temp table probe_results (kind text, who text, subject text, ok boolean, detail text);
grant all on probe_results to public;

-- 1 + 2: every public table and view readable as every kind of user (this plans all policies, so a policy loop shows up here)
create function pg_temp.read_all() returns void language plpgsql as $$
declare r record; t record; u uuid;
begin
  for r in select unnest(array['anon','household','cleaner','business','admin']) as who loop
    select uid into u from probe_users where role = r.who;
    for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r','v') order by 1 loop
      begin
        perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
        execute 'set local role ' || case when r.who = 'anon' then 'anon' else 'authenticated' end;
        execute format('select 1 from public.%I limit 0', t.relname);
        reset role;
        insert into probe_results values ('read', r.who, t.relname, true, null);
      exception when others then
        reset role;
        insert into probe_results values ('read', r.who, t.relname, false, sqlstate || ' ' || sqlerrm);
      end;
    end loop;
  end loop;
end $$;
select pg_temp.read_all();

-- 3: the business sign-up path, exactly as the app does it (insert ... returning)
do $$
declare u uuid; bid uuid; uid2 uuid;
begin
  select uid into u from probe_users where role = 'business';
  perform set_config('request.jwt.claim.sub', u::text, true);
  begin
    set local role authenticated;
    insert into business_profiles (user_id, company_name, business_type, contact_first_name, contact_last_name, unit_count)
      values (u, 'Probe BV', 'office', 'A', 'B', 1) returning id into bid;
    insert into business_units (business_id, name, address_line, postcode, city)
      values (bid, 'HQ', 'Straat 1', '7433 RB', 'Schalkhaar') returning id into uid2;
    perform 1 from business_profiles where id = bid;
    perform 1 from business_units where id = uid2;
    insert into jobs (business_id, status, space_type, postcode, frequency, description, budget_cents, start_date, weekdays, visit_start, visit_hours)
      values (bid, 'published', 'office', '7433 RB', 'weekly', 'Weekly office cleaning, evenings.', 2000, current_date, '{2}', '18:00', 2);
    insert into emergency_requests (requester_id, requester_type, address_line, postcode, city, window_start, window_end, hours, tasks, unit_id)
      values (u, 'business', 'Straat 1', '7433 RB', 'Schalkhaar', now() + interval '10 hours', now() + interval '13 hours', 3, 'Cover shift offices', uid2);
    reset role;
    insert into probe_results values ('flow', 'business', 'sign-up, unit, job, emergency request', true, null);
  exception when others then
    reset role;
    insert into probe_results values ('flow', 'business', 'sign-up, unit, job, emergency request', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;


-- 4: cover flow on the real database: cleaner accepts, work record + fee event appear, requester cancels, strikes via attendance
do $$
declare bu uuid; cu uuid; cp uuid; rid uuid; rid2 uuid; res text; n int; bid uuid; unitid uuid;
begin
  select uid into bu from probe_users where role = 'business';
  select uid into cu from probe_users where role = 'cleaner';
  select id into bid from business_profiles where user_id = bu;
  select id into unitid from business_units where business_id = bid limit 1;
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true);
    set local role authenticated;
    insert into cleaner_profiles (user_id, status, rate_cents, postcode, job_types, work_scope, work_types, emergency_opt_in, emergency_rate_cents)
      values (cu, 'published', 2000, '7433 RB', array['household','office','emergency'], 'both', array['household_regular','commercial_contract','emergency_cover'], true, 3000) returning id into cp;
    reset role;
    insert into probe_results values ('flow', 'cleaner', 'create published ad', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'cleaner', 'create published ad', false, sqlstate || ' ' || sqlerrm); return; end;

  begin
    perform set_config('request.jwt.claim.sub', cu::text, true);
    set local role authenticated;
    select id into rid from emergency_requests_open limit 1;
    if rid is null then raise exception 'open request not visible to an eligible cleaner'; end if;
    reset role;
    insert into probe_results values ('flow', 'cleaner', 'sees the open business request (view)', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'cleaner', 'sees the open business request (view)', false, sqlstate || ' ' || sqlerrm); return; end;

  begin
    perform set_config('request.jwt.claim.sub', cu::text, true);
    set local role authenticated;
    select accept_emergency_request(rid) into res;
    reset role;
    if res::boolean is not true then raise exception 'accept returned %', res; end if;
    select count(*) into n from work_records where reference_id = rid and outcome = 'scheduled';
    if n <> 1 then raise exception 'work record missing'; end if;
    select count(*) into n from fee_events where reference_id = rid and amount_cents = 0 and status = 'pending';
    if n <> 1 then raise exception 'fee event missing'; end if;
    insert into probe_results values ('flow', 'cleaner', 'accept → work record + € 0 fee event', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'cleaner', 'accept → work record + € 0 fee event', false, sqlstate || ' ' || sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', bu::text, true);
    set local role authenticated;
    select count(*) into n from work_records;      if n <> 1 then raise exception 'business sees % work records', n; end if;
    select count(*) into n from fee_events;        if n <> 1 then raise exception 'business sees % fee events', n; end if;
    select cancel_emergency_request(rid, 'plans changed') into res;
    reset role;
    if res <> 'cancelled_free' then raise exception 'cancel returned %', res; end if;
    select count(*) into n from fee_events where reference_id = rid and status = 'waived';
    if n <> 1 then raise exception 'fee event not waived'; end if;
    insert into probe_results values ('flow', 'business', 'sees own work + fee event; cancel outside window waives the event', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'business', 'sees own work + fee event; cancel outside window waives the event', false, sqlstate || ' ' || sqlerrm); end;

  -- a household cannot read the company's work records, fee events or units
  begin
    perform set_config('request.jwt.claim.sub', (select uid::text from probe_users where role = 'household'), true);
    set local role authenticated;
    select count(*) into n from work_records;   if n <> 0 then raise exception 'household sees % work records', n; end if;
    select count(*) into n from fee_events;     if n <> 0 then raise exception 'household sees % fee events', n; end if;
    select count(*) into n from business_units; if n <> 0 then raise exception 'household sees % units', n; end if;
    reset role;
    insert into probe_results values ('flow', 'household', 'cannot see business work, fees or units', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'household', 'cannot see business work, fees or units', false, sqlstate || ' ' || sqlerrm); end;
end $$;


-- 5: isolation between two businesses + a household, and the dashboard reads
do $$
declare b1 uuid; b2 uuid; hh uuid; n int; b1bp uuid;
begin
  select uid into b1 from probe_users where role = 'business';
  select uid into hh from probe_users where role = 'household';
  select id into b1bp from business_profiles where user_id = b1;
  insert into auth.users (email, raw_user_meta_data) values ('biz2@probe.test', '{"role":"business","display_name":"BIZ2"}') returning id into b2;
  begin
    perform set_config('request.jwt.claim.sub', b2::text, true);
    set local role authenticated;
    insert into business_profiles (user_id, company_name, business_type, contact_first_name, contact_last_name, unit_count) values (b2, 'Second BV', 'hotel', 'C', 'D', 1);
    with u as (update business_profiles set company_name = 'HACKED' where id = b1bp returning 1) select count(*) into n from u;      if n <> 0 then raise exception 'edited another company'; end if;
    with d as (delete from business_profiles where id = b1bp returning 1) select count(*) into n from d;                          if n <> 0 then raise exception 'deleted another company'; end if;
    with d as (delete from business_units where business_id = b1bp returning 1) select count(*) into n from d;                   if n <> 0 then raise exception 'deleted another units'; end if;
    select count(*) into n from business_units where business_id = b1bp;                                                         if n <> 0 then raise exception 'sees another units'; end if;
    select count(*) into n from fee_events;                                                                                       if n <> 0 then raise exception 'sees another fee events'; end if;
    select count(*) into n from emergency_requests where requester_id = b1;                                                       if n <> 0 then raise exception 'sees another emergency requests'; end if;
    begin insert into business_units (business_id, name, address_line, postcode, city) values (b1bp, 'x', 'x', '1011 AB', 'x'); raise exception 'added a unit to another company';
    exception when insufficient_privilege then null; when others then if sqlstate not in ('42501') then raise; end if; end;
    reset role;
    insert into probe_results values ('flow', 'business', 'a second business cannot read, edit, delete or add to another company', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'business', 'a second business cannot read, edit, delete or add to another company', false, sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true);
    set local role authenticated;
    with u as (update business_profiles set company_name = 'HACKED' returning 1) select count(*) into n from u; if n <> 0 then raise exception 'household edited a company'; end if;
    reset role;
    insert into probe_results values ('flow', 'household', 'cannot edit a company', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'household', 'cannot edit a company', false, sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', b1::text, true);
    set local role authenticated;
    update business_profiles set unit_count = 2 where user_id = b1;
    insert into business_units (business_id, name, address_line, postcode, city) values (b1bp, 'Second', 'Kade 5', '1011 AB', 'Amsterdam');
    perform id, user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count, unit_price_cents, pending_unit_count, billing_started_at, billing_paused_at, billing_ended_at, payment_failed_at, created_at from business_profiles where user_id = b1;
    perform 1 from profiles where id = b1;
    perform 1 from cleaning_slots; perform 1 from invoices; perform 1 from jobs j left join job_responses r on r.job_id = j.id; perform 1 from fee_events; perform 1 from work_records; perform 1 from emergency_requests where requester_id = b1;
    reset role;
    insert into probe_results values ('flow', 'business', 'dashboard reads + unit count + second address', true, null);
  exception when others then reset role; insert into probe_results values ('flow', 'business', 'dashboard reads + unit count + second address', false, sqlstate || ' ' || sqlerrm); end;
end $$;


-- Upgrade mode: Part 14 is applied NOW, on top of the data created above, then the table reads are repeated.
\if :{?apply_part14}
\ir ../../supabase/migrations/0024_business_public_view.sql
select pg_temp.read_all();
\endif

-- 6: privacy of company information (Part 14): who can read which columns, and writes through the view
create function pg_temp.pcount(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || p_role;
  begin execute p_sql into n; exception when others then reset role; return 'ERR ' || sqlstate; end;
  reset role; return n::text;
end $$;
create temp table pcheck (label text, who text, got text, want text);
create function pg_temp.chk(p_label text, p_role text, p_who text, p_uid uuid, p_sql text, p_want text) returns void language plpgsql as $$
begin insert into pcheck values (p_label, p_who, pg_temp.pcount(p_role, p_uid, p_sql), p_want); end $$;

select set_config('probe.hh',  (select uid::text from probe_users where role = 'household'), false),
       set_config('probe.cl',  (select uid::text from probe_users where role = 'cleaner'), false),
       set_config('probe.b1',  (select uid::text from probe_users where role = 'business'), false),
       set_config('probe.b2',  (select id::text from auth.users where email = 'biz2@probe.test'), false),
       set_config('probe.adm', (select uid::text from probe_users where role = 'admin'), false) \gset
select current_setting('probe.hh')::uuid as hh, current_setting('probe.cl')::uuid as cl, current_setting('probe.b1')::uuid as b1, current_setting('probe.b2')::uuid as b2, current_setting('probe.adm')::uuid as adm \gset

-- state: Probe BV (b1) has a published job, Second BV (b2) has none
select pg_temp.chk('anon gets no business_profiles rows', 'anon', 'anon', null, 'select count(*) from business_profiles', '0');
select pg_temp.chk('anon cannot even select the VAT number column', 'anon', 'anon', null, 'select count(btw_number) from business_profiles', 'ERR 42501');
select pg_temp.chk('anon cannot even select the contact name columns', 'anon', 'anon', null, 'select count(contact_first_name) from business_profiles', 'ERR 42501');
select pg_temp.chk('anon cannot select billing columns', 'anon', 'anon', null, 'select count(payment_failed_at) from business_profiles', 'ERR 42501');
select pg_temp.chk('anon cannot write business_profiles', 'anon', 'anon', null, $q$with u as (update business_profiles set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 42501');
select pg_temp.chk('household sees no business_profiles row', 'authenticated', 'household', :'hh', 'select count(*) from business_profiles', '0');
select pg_temp.chk('cleaner sees no business_profiles row', 'authenticated', 'cleaner', :'cl', 'select count(*) from business_profiles', '0');
select pg_temp.chk('business 2 sees only its own business_profiles row', 'authenticated', 'business 2', :'b2', 'select count(*) from business_profiles', '1');
select pg_temp.chk('business 2 cannot read business 1 (VAT, contact, billing)', 'authenticated', 'business 2', :'b2', $q$select count(*) from business_profiles where company_name = 'Probe BV'$q$, '0');
select pg_temp.chk('owner reads the full profile (contact, VAT, units, billing)', 'authenticated', 'business 1', :'b1', 'select count(*) from (select company_name, contact_first_name, contact_last_name, btw_number, kvk_number, unit_count, unit_price_cents, billing_started_at, payment_failed_at from business_profiles) x', '1');
select pg_temp.chk('admin reads all business_profiles', 'authenticated', 'admin', :'adm', 'select count(*) from business_profiles', '2');
select pg_temp.chk('anon sees the company with a published job (name/type only)', 'anon', 'anon', null, 'select count(*) from business_public', '1');
select pg_temp.chk('household sees the company with a published job', 'authenticated', 'household', :'hh', 'select count(*) from business_public', '1');
select pg_temp.chk('household does not see a company without a published job', 'authenticated', 'household', :'hh', $q$select count(*) from business_public where company_name = 'Second BV'$q$, '0');
select pg_temp.chk('owner sees own company in the view without a published job', 'authenticated', 'business 2', :'b2', $q$select count(*) from business_public where company_name = 'Second BV'$q$, '1');
select pg_temp.chk('admin sees both companies in the view', 'authenticated', 'admin', :'adm', 'select count(*) from business_public', '2');
-- private columns are not in the view
select pg_temp.chk('view has no VAT number', 'authenticated', 'household', :'hh', 'select count(btw_number) from business_public', 'ERR 42703');
select pg_temp.chk('view has no contact name', 'authenticated', 'household', :'hh', 'select count(contact_first_name) from business_public', 'ERR 42703');
select pg_temp.chk('view has no owner user id', 'authenticated', 'household', :'hh', 'select count(user_id) from business_public', 'ERR 42703');
select pg_temp.chk('view has no billing columns', 'anon', 'anon', null, 'select count(payment_failed_at) from business_public', 'ERR 42703');
select pg_temp.chk('view exposes exactly three columns', 'authenticated', 'household', :'hh', $q$select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'business_public'$q$, '3');
-- nobody can write through the view
select pg_temp.chk('anon cannot update via the view', 'anon', 'anon', null, $q$with u as (update business_public set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 55000');
select pg_temp.chk('household cannot update via the view', 'authenticated', 'household', :'hh', $q$with u as (update business_public set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 55000');
select pg_temp.chk('business 2 cannot rename business 1 via the view', 'authenticated', 'business 2', :'b2', $q$with u as (update business_public set company_name = 'X' where company_name = 'Probe BV' returning 1) select count(*) from u$q$, 'ERR 55000');
select pg_temp.chk('business 2 cannot delete via the view', 'authenticated', 'business 2', :'b2', $q$with d as (delete from business_public returning 1) select count(*) from d$q$, 'ERR 55000');
select pg_temp.chk('business 2 cannot insert via the view', 'authenticated', 'business 2', :'b2', $q$with i as (insert into business_public (company_name) values ('X') returning 1) select count(*) from i$q$, 'ERR 55000');
select pg_temp.chk('row level security is still enabled on business_profiles', 'authenticated', 'business 1', :'b1', $q$select count(*) from pg_class where relname = 'business_profiles' and relrowsecurity$q$, '1');

select pg_temp.chk('cleaner reads a published job together with its company name', 'authenticated', 'cleaner', :'cl', $q$select count(*) from jobs j join business_public bp on bp.id = j.business_id where j.status = 'published'$q$, '1');
select pg_temp.chk('household reads a published job together with its company name', 'authenticated', 'household', :'hh', $q$select count(*) from jobs j join business_public bp on bp.id = j.business_id where j.status = 'published'$q$, '1');
select pg_temp.chk('anon (guest jobs board) reads a published job with its company name', 'anon', 'anon', null, $q$select count(*) from jobs j join business_public bp on bp.id = j.business_id where j.status = 'published'$q$, '1');
-- path 2: a cleaner sees a company it has worked for, even without a published job
update jobs set status = 'filled';
select pg_temp.chk('no published job: household sees no company', 'authenticated', 'household', :'hh', 'select count(*) from business_public', '0');
select pg_temp.chk('no published job: anon sees no company', 'anon', 'anon', null, 'select count(*) from business_public', '0');
select pg_temp.chk('cleaner with a work record sees that company', 'authenticated', 'cleaner', :'cl', 'select count(*) from business_public', '1');
-- path 3: an active connection (turnover slots) shows the company name to that cleaner
select pg_temp.chk('cleaner not yet connected does not see Second BV', 'authenticated', 'cleaner', :'cl', $q$select count(*) from business_public where company_name = 'Second BV'$q$, '0');
select set_config('request.jwt.claim.sub', '', false);
insert into connections (household_id, cleaner_id, status) values (:'b2', :'cl', 'active');
select pg_temp.chk('cleaner with an active connection sees Second BV', 'authenticated', 'cleaner', :'cl', $q$select count(*) from business_public where company_name = 'Second BV'$q$, '1');
select pg_temp.chk('the connection does not leak business_profiles to the cleaner', 'authenticated', 'cleaner', :'cl', 'select count(*) from business_profiles', '0');
update jobs set status = 'published';


-- 7: hardening (Part 14): helpers not callable through the API, grants, read-only view, search_path
select pg_temp.chk('public.business_public_visible does not exist (anon)', 'anon', 'anon', null, 'select public.business_public_visible(gen_random_uuid())::int', 'ERR 42883');
select pg_temp.chk('public.business_public_visible does not exist (signed in)', 'authenticated', 'household', :'hh', 'select public.business_public_visible(gen_random_uuid())::int', 'ERR 42883');
select pg_temp.chk('public.business_has_published_job removed', 'authenticated', 'household', :'hh', 'select public.business_has_published_job(gen_random_uuid())::int', 'ERR 42883');
select pg_temp.chk('no PUBLIC grantee on business_public or business_profiles', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_class c, aclexplode(c.relacl) a where c.relnamespace = 'public'::regnamespace and c.relname in ('business_public','business_profiles') and a.grantee = 0$q$, '0');
select pg_temp.chk('anon cannot select any private column (has_column_privilege)', 'authenticated', 'catalog', :'hh', $q$select count(*) from unnest(array['company_name','btw_number','contact_first_name','contact_last_name','unit_count','unit_price_cents','billing_started_at','payment_failed_at','mollie_customer_id']) col where has_column_privilege('anon','public.business_profiles',col,'select')$q$, '0');
select pg_temp.chk('authenticated has no truncate/references/trigger on business_profiles', 'authenticated', 'catalog', :'hh', $q$select count(*) from information_schema.table_privileges where table_name = 'business_profiles' and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')$q$, '0');
select pg_temp.chk('the view is not auto-updatable', 'authenticated', 'catalog', :'hh', $q$select pg_relation_is_updatable('public.business_public'::regclass, false)$q$, '0');
select pg_temp.chk('view options: security barrier on', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_class where relname = 'business_public' and reloptions @> array['security_barrier=true']$q$, '1');
select pg_temp.chk('the two existing helpers use an empty search_path', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_proc p where p.proname in ('is_admin','cleaner_connected_to_business') and p.pronamespace = 'public'::regnamespace and not (p.proconfig @> array['search_path=""'])$q$, '0');
select pg_temp.chk('no schema named private exists (nothing extra for any API to expose)', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_namespace where nspname = 'private'$q$, '0');
select pg_temp.chk('the view calls no function except auth.uid()', 'authenticated', 'catalog', :'hh', $q$select count(*) from regexp_matches(pg_get_viewdef('public.business_public'::regclass), '(is_admin|cleaner_connected|business_public_visible|business_has_published)', 'g')$q$, '0');
select pg_temp.chk('no function was added by Part 14 (only the two hardened helpers differ): no *_visible helper anywhere', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_proc where proname like '%public_visible%'$q$, '0');
select pg_temp.chk('no public function named like the private helper', 'authenticated', 'catalog', :'hh', $q$select count(*) from pg_proc where proname like 'business_%visible%' and pronamespace = 'public'::regnamespace$q$, '0');
select pg_temp.chk('privilege layer: neither API role holds insert/update/delete/truncate on the view', 'authenticated', 'catalog', :'hh', $q$select count(*) from (values ('anon'),('authenticated')) r(role), (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv) where has_table_privilege(r.role, 'public.business_public', p.priv)$q$, '0');
select pg_temp.chk('privilege layer: both API roles can select the view', 'authenticated', 'catalog', :'hh', $q$select count(*) from (values ('anon'),('authenticated')) r(role) where has_table_privilege(r.role, 'public.business_public', 'SELECT')$q$, '2');
-- a later migration that re-grants everything must not re-open writes through the view
grant all on public.business_public to authenticated, anon;
select pg_temp.chk('after a careless re-grant: update through the view still impossible', 'authenticated', 'business 2', :'b2', $q$with u as (update business_public set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 55000');
select pg_temp.chk('after a careless re-grant: delete through the view still impossible', 'authenticated', 'business 2', :'b2', $q$with d as (delete from business_public returning 1) select count(*) from d$q$, 'ERR 55000');
select pg_temp.chk('after a careless re-grant: insert through the view still impossible', 'anon', 'anon', null, $q$with i as (insert into business_public (company_name) values ('X') returning 1) select count(*) from i$q$, 'ERR 55000');
select pg_temp.chk('after a careless re-grant: still only three columns', 'authenticated', 'household', :'hh', 'select count(btw_number) from business_public', 'ERR 42703');
revoke all on public.business_public from anon, authenticated; grant select on public.business_public to anon, authenticated;


-- 8: quotations, one-off cleaning and regular schedules (Part 15)
create function pg_temp.fl(p_who text, p_subject text, p_ok boolean, p_detail text) returns void language sql as
  $$ insert into probe_results values ('flow', p_who, p_subject, p_ok, p_detail) $$;
do $$
declare
  bu uuid; cu uuid; c2 uuid; hh uuid; b2 uuid; bid uuid; cp1 uuid; cp2 uuid;
  j_once uuid; j_week uuid; r1 uuid; r2 uuid; rw uuid; res jsonb; n int; n2 int; dummy int;
begin
  select uid into bu from probe_users where role = 'business';
  select uid into cu from probe_users where role = 'cleaner';
  select uid into hh from probe_users where role = 'household';
  select id into b2 from auth.users where email = 'biz2@probe.test';
  select id into bid from business_profiles where user_id = bu;
  select id into cp1 from cleaner_profiles where user_id = cu;
  insert into auth.users (email, raw_user_meta_data) values ('cl2@probe.test', '{"role":"cleaner","display_name":"CL2"}') returning id into c2;
  insert into cleaner_profiles (user_id, status, rate_cents, postcode, job_types, work_scope, work_types)
    values (c2, 'published', 2200, '7433 RB', array['office'], 'both', array['commercial_contract']) returning id into cp2;

  -- posting: schedule rules and service switch
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    insert into jobs (business_id, status, space_type, postcode, frequency, description, budget_cents)
      values (bid, 'published', 'office', '7433 RB', 'weekly', 'Weekly cleaning without a start date', 2000);
    reset role; perform pg_temp.fl('business', 'recurring job without a start date is refused', false, 'was accepted');
  exception when others then reset role; perform pg_temp.fl('business', 'recurring job without a start date is refused', sqlerrm = 'start date required', sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    insert into jobs (business_id, status, space_type, postcode, frequency, description, budget_cents, start_date, visit_start, visit_hours)
      values (bid, 'published', 'office', '7433 RB', 'once', 'One-off deep clean before the opening', 2000, current_date + 3, '08:00', 4) returning id into j_once;
    insert into jobs (business_id, status, space_type, postcode, frequency, description, budget_cents, start_date, weekdays, visit_start, visit_hours)
      values (bid, 'published', 'office', '7433 RB', 'weekly', 'Weekly cleaning on Mondays and Thursdays', 2000, current_date, '{1,4}', '07:00', 2) returning id into j_week;
    reset role; perform pg_temp.fl('business', 'posts a one-off and a weekly job with schedule', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'posts a one-off and a weekly job with schedule', false, sqlstate || ' ' || sqlerrm); return; end;

  -- quotations
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    res := submit_job_quote(j_once, 2000, 'We can do it with two people', current_date + 10);
    if res ->> 'result' <> 'sent' or (res ->> 'business_user_id')::uuid <> bu then raise exception 'send returned %', res; end if;
    if submit_job_quote(j_once, 2000, 'again', null) ->> 'result' <> 'already' then raise exception 'second quote not refused'; end if;
    if submit_job_quote(j_once, 900, 'cheap', null) ->> 'result' <> 'rate' then raise exception 'rate floor not enforced'; end if;
    if submit_job_quote(j_week, 2100, '', null) ->> 'result' <> 'message' then raise exception 'empty message accepted'; end if;
    if submit_job_quote(j_week, 2100, 'late', current_date - 1) ->> 'result' <> 'valid_until' then raise exception 'past validity accepted'; end if;
    if submit_job_quote(gen_random_uuid(), 2100, 'x', null) ->> 'result' <> 'not_available' then raise exception 'unknown job accepted'; end if;
    reset role; perform pg_temp.fl('cleaner', 'sends a quotation; floor, duplicate, empty and expired are refused', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'sends a quotation; floor, duplicate, empty and expired are refused', false, sqlstate || ' ' || sqlerrm); return; end;

  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    insert into job_responses (job_id, cleaner_profile_id, rate_cents, message) values (j_week, cp1, 2100, 'direct');
    reset role; perform pg_temp.fl('cleaner', 'cannot write a quotation straight into the table', false, 'insert worked');
  exception when others then reset role; perform pg_temp.fl('cleaner', 'cannot write a quotation straight into the table', sqlstate = '42501', sqlstate); end;

  begin
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    if submit_job_quote(j_once, 2300, 'Second cleaner', null) ->> 'result' <> 'sent' then raise exception 'second cleaner could not quote'; end if;
    if submit_job_quote(j_week, 2300, 'Second cleaner, weekly', null) ->> 'result' <> 'sent' then raise exception 'second cleaner could not quote weekly'; end if;
    select count(*) into n from job_responses; if n <> 2 then raise exception 'cleaner sees % quotations (expected only their own 2)', n; end if;
    reset role; perform pg_temp.fl('cleaner', 'sees only their own quotations', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'sees only their own quotations', false, sqlstate || ' ' || sqlerrm); end;

  -- who may decide
  select id into r1 from job_responses where job_id = j_once and cleaner_profile_id = cp1;
  select id into r2 from job_responses where job_id = j_once and cleaner_profile_id = cp2;
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    if accept_job_response(r1) ->> 'result' <> 'not_allowed' then raise exception 'the cleaner could accept their own quotation'; end if;
    perform set_config('request.jwt.claim.sub', b2::text, true);
    if accept_job_response(r1) ->> 'result' <> 'not_allowed' then raise exception 'another business could accept'; end if;
    if decline_job_response(r1) ->> 'result' <> 'not_allowed' then raise exception 'another business could decline'; end if;
    perform set_config('request.jwt.claim.sub', hh::text, true);
    if accept_job_response(r1) ->> 'result' <> 'not_allowed' then raise exception 'a household could accept'; end if;
    select count(*) into n from job_responses; if n <> 0 then raise exception 'household reads % quotations', n; end if;
    reset role; perform pg_temp.fl('all', 'only the job''s own business can accept or decline', true, null);
  exception when others then reset role; perform pg_temp.fl('all', 'only the job''s own business can accept or decline', false, sqlstate || ' ' || sqlerrm); end;

  -- one-off: accept
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    begin update jobs set awarded_response_id = r1 where id = j_once; raise exception 'direct award allowed'; exception when others then if sqlerrm <> 'protected column' then raise; end if; end;
    begin update jobs set status = 'filled' where id = j_once; raise exception 'direct status change allowed'; exception when others then if sqlerrm <> 'protected column' then raise; end if; end;
    res := accept_job_response(r1);
    reset role;
    if res ->> 'result' <> 'accepted' or (res ->> 'cleaner_user_id')::uuid <> cu then raise exception 'accept returned %', res; end if;
    if jsonb_array_length(res -> 'declined_user_ids') <> 1 or (res -> 'declined_user_ids' ->> 0)::uuid <> c2 then raise exception 'declined list wrong: %', res; end if;
    if (select status from jobs where id = j_once) <> 'filled' then raise exception 'job not filled'; end if;
    if (select status from job_responses where id = r2) <> 'declined' then raise exception 'other quotation not declined'; end if;
    select count(*) into n from work_records where job_id = j_once and service_key = 'oneoff' and outcome = 'scheduled' and cleaner_profile_id = cp1 and scheduled_start is not null;
    if n <> 1 then raise exception 'one-off work record missing'; end if;
    select count(*) into n from fee_events where service_key = 'oneoff' and event_type = 'quote_accepted' and reference_id = r1 and amount_cents = 0;
    if n <> 1 then raise exception 'fee event missing or not EUR 0'; end if;
    perform pg_temp.fl('business', 'accepts a one-off quotation: awarded, others declined, work scheduled, EUR 0 event', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'accepts a one-off quotation: awarded, others declined, work scheduled, EUR 0 event', false, sqlstate || ' ' || sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    if accept_job_response(r1) ->> 'result' <> 'not_available' then raise exception 'second accept allowed'; end if;
    if accept_job_response(r2) ->> 'result' <> 'not_available' then raise exception 'declined quotation accepted'; end if;
    update jobs set status = 'removed' where id = j_once;
    reset role; perform pg_temp.fl('business', 'an awarded job cannot be awarded twice or taken down', false, 'removal allowed');
  exception when others then reset role; perform pg_temp.fl('business', 'an awarded job cannot be awarded twice or taken down', sqlerrm = 'job is awarded', sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    select count(*) into n from jobs where id = j_once; if n <> 1 then raise exception 'cleaner cannot read the job they quoted on'; end if;
    select count(*) into n from work_records where job_id = j_once; if n <> 1 then raise exception 'cleaner does not see their work'; end if;
    perform set_config('request.jwt.claim.sub', c2::text, true);
    select count(*) into n from work_records where job_id = j_once; if n <> 0 then raise exception 'the other cleaner sees this work'; end if;
    reset role; perform pg_temp.fl('cleaner', 'reads the job and work they were awarded; the other cleaner does not', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'reads the job and work they were awarded; the other cleaner does not', false, sqlstate || ' ' || sqlerrm); end;

  -- regular job: accept generates visits
  select id into rw from job_responses where job_id = j_week and cleaner_profile_id = cp2;
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    res := accept_job_response(rw);
    reset role;
    if res ->> 'result' <> 'accepted' then raise exception 'accept returned %', res; end if;
    select count(*) into n from work_records where job_id = j_week and service_key = 'contract' and outcome = 'scheduled' and cleaner_profile_id = cp2;
    if n < 7 or n > 9 then raise exception 'expected 7-9 visits in four weeks (two weekdays), got %', n; end if;
    select count(*) into n2 from work_records where job_id = j_week and extract(isodow from scheduled_start at time zone 'Europe/Amsterdam') not in (1, 4);
    if n2 <> 0 then raise exception '% visits on the wrong weekday', n2; end if;
    select count(*) into n2 from work_records where job_id = j_week and (scheduled_start at time zone 'Europe/Amsterdam')::time <> '07:00' ;
    if n2 <> 0 then raise exception '% visits at the wrong start time', n2; end if;
    select count(*) into n2 from work_records where job_id = j_week and scheduled_end - scheduled_start <> interval '2 hours';
    if n2 <> 0 then raise exception '% visits with the wrong length', n2; end if;
    perform generate_job_visits(j_week, 28);
    select count(*) into n2 from work_records where job_id = j_week; if n2 <> n then raise exception 'generating twice duplicated visits (% -> %)', n, n2; end if;
    select count(*) into n2 from fee_events where service_key = 'contract' and event_type = 'contract_month' and amount_cents = 0;
    if n2 < 1 or n2 > 2 then raise exception 'contract month events: %', n2; end if;
    perform pg_temp.fl('business', 'accepts a regular quotation: visits on the right days and times, idempotent, EUR 0 events', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'accepts a regular quotation: visits on the right days and times, idempotent, EUR 0 events', false, sqlstate || ' ' || sqlerrm); end;

  -- cancel
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    if cancel_awarded_job(j_week) ->> 'result' <> 'not_allowed' then raise exception 'a household cancelled a contract'; end if;
    perform set_config('request.jwt.claim.sub', c2::text, true);
    res := cancel_awarded_job(j_week);
    reset role;
    if res ->> 'result' <> 'cancelled' or res ->> 'by' <> 'cleaner' or (res ->> 'other_user_id')::uuid <> bu then raise exception 'cancel returned %', res; end if;
    select count(*) into n from work_records where job_id = j_week and outcome = 'scheduled' and scheduled_start > now(); if n <> 0 then raise exception '% future visits left', n; end if;
    perform generate_job_visits(j_week, 28);
    select count(*) into n from work_records where job_id = j_week and outcome = 'scheduled'; if n <> 0 then raise exception 'visits regenerated after cancel'; end if;
    perform pg_temp.fl('cleaner', 'cancelling an awarded contract cancels future visits and stops generation', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'cancelling an awarded contract cancels future visits and stops generation', false, sqlstate || ' ' || sqlerrm); end;

  -- housekeeping is not callable through the API
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    perform expire_stale_jobs();
    reset role; perform pg_temp.fl('business', 'housekeeping functions are not callable by users', false, 'call worked');
  exception when others then reset role; perform pg_temp.fl('business', 'housekeeping functions are not callable by users', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    perform generate_job_visits(j_week, 28);
    reset role; perform pg_temp.fl('business', 'visit generation is not callable by users', false, 'call worked');
  exception when others then reset role; perform pg_temp.fl('business', 'visit generation is not callable by users', sqlstate = '42501', sqlstate); end;
  begin
    set local role service_role;
    update jobs set expires_at = now() - interval '1 day' where id = (select id from jobs where status = 'published' limit 1);
    select expire_stale_jobs() into n; reset role;
    if n < 1 then raise exception 'nothing expired'; end if;
    perform pg_temp.fl('service', 'the cron can expire stale jobs', true, null);
  exception when others then reset role; perform pg_temp.fl('service', 'the cron can expire stale jobs', false, sqlstate || ' ' || sqlerrm); end;
end $$;


-- 9: hardening and gaps (Part 16)
do $$
declare
  bu uuid; cu uuid; c2 uuid; hh uuid; ad uuid; bid uuid; cp1 uuid; cp2 uuid; unitid uuid;
  er uuid; res text; n int; cid uuid; ok boolean; st text; dist numeric; jid uuid;
begin
  select uid into bu from probe_users where role = 'business';
  select uid into cu from probe_users where role = 'cleaner';
  select uid into hh from probe_users where role = 'household';
  select uid into ad from probe_users where role = 'admin';
  select id into c2 from auth.users where email = 'cl2@probe.test';
  select id into bid from business_profiles where user_id = bu;
  select id into cp1 from cleaner_profiles where user_id = cu;
  select id into cp2 from cleaner_profiles where user_id = c2;
  select id into unitid from business_units where business_id = bid limit 1;

  -- 1. the helper views cannot be written
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    delete from cleaner_vog_badges;
    reset role; perform pg_temp.fl('household', 'cannot delete through cleaner_vog_badges', false, 'delete worked');
  exception when others then reset role; perform pg_temp.fl('household', 'cannot delete through cleaner_vog_badges', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    delete from emergency_requests_open;
    reset role; perform pg_temp.fl('cleaner', 'cannot delete through emergency_requests_open', false, 'delete worked');
  exception when others then reset role; perform pg_temp.fl('cleaner', 'cannot delete through emergency_requests_open', sqlstate = '42501', sqlstate); end;

  -- 2. VOG
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    begin insert into vog_documents (cleaner_profile_id, issued_at, status) values (cp1, current_date, 'approved'); raise exception 'self-approved insert worked';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    insert into vog_documents (cleaner_profile_id, issued_at, status) values (cp1, current_date, 'pending');
    update vog_documents set status = 'approved' where cleaner_profile_id = cp1;
    get diagnostics n = row_count;
    reset role;
    raise exception 'self-approval update was accepted (% rows)', n;
  exception when others then reset role;
    perform pg_temp.fl('cleaner', 'cannot approve their own VOG (insert or update)', sqlstate = '42501' or sqlerrm like 'new row violates%', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform set_config('request.jwt.claim.sub', ad::text, true); set local role authenticated;
    update vog_documents set status = 'approved' where cleaner_profile_id = cp1;
    reset role;
    if (select status from vog_documents where cleaner_profile_id = cp1) <> 'approved' then raise exception 'admin approval did not stick'; end if;
    perform pg_temp.fl('admin', 'approves a VOG', true, null);
  exception when others then reset role; perform pg_temp.fl('admin', 'approves a VOG', false, sqlstate || ' ' || sqlerrm); end;

  -- 3. emergency requests
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    insert into emergency_requests (requester_id, requester_type, address_line, postcode, city, window_start, window_end, hours, tasks, unit_id, status, accepted_by, fee_cents)
      values (bu, 'business', 'Straat 1', '7433 RB', 'Schalkhaar', now() - interval '3 hours', now() - interval '1 hour', 2, 'forged', unitid, 'accepted', cp2, 0);
    reset role; perform pg_temp.fl('business', 'a request starting in the past is refused', false, 'insert worked');
  exception when others then reset role; perform pg_temp.fl('business', 'a request starting in the past is refused', sqlerrm = 'window in the past', sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    insert into emergency_requests (requester_id, requester_type, address_line, postcode, city, window_start, window_end, hours, tasks, unit_id, status, accepted_by, fee_cents)
      values (bu, 'business', 'Straat 1', '7433 RB', 'Schalkhaar', now() + interval '5 hours', now() + interval '8 hours', 3, 'forged accepted', unitid, 'accepted', cp2, 0) returning id into er;
    reset role;
    select status, count(*) filter (where accepted_by is not null) into st, n from emergency_requests where id = er group by status;
    if st <> 'searching' or n <> 0 then raise exception 'forged row kept status % / accepted_by', st; end if;
    perform pg_temp.fl('business', 'a forged "accepted" request is stored as searching without a cleaner', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'a forged "accepted" request is stored as searching without a cleaner', false, sqlstate || ' ' || sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    res := accept_emergency_request(er)::text;
    reset role;
    if res <> 'true' then raise exception 'cleaner could not accept: %', res; end if;
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    update emergency_requests set window_start = now() - interval '2 hours', window_end = now() - interval '1 hour' where id = er;
    delete from emergency_requests where id = er;
    get diagnostics n = row_count;
    reset role;
    if n <> 0 then raise exception 'accepted request was deleted'; end if;
    if (select window_start from emergency_requests where id = er) < now() then raise exception 'window of an accepted request was moved'; end if;
    perform pg_temp.fl('business', 'an accepted request keeps its window and cannot be deleted', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'an accepted request keeps its window and cannot be deleted', false, sqlstate || ' ' || sqlerrm); end;

  begin
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    if report_emergency_attendance(er, false, 'x') then raise exception 'no-show before the window even started'; end if;
    reset role; perform pg_temp.fl('business', 'a no-show cannot be filed before the window has started', true, null);
  exception when others then reset role; perform pg_temp.fl('business', 'a no-show cannot be filed before the window has started', false, sqlstate || ' ' || sqlerrm); end;

  -- a hidden ad cannot take emergency work
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set status = 'hidden' where id = cp1;
    insert into emergency_requests (requester_id, requester_type, address_line, postcode, city, window_start, window_end, hours, tasks, unit_id)
      values (bu, 'business', 'Straat 1', '7433 RB', 'Schalkhaar', now() + interval '6 hours', now() + interval '9 hours', 3, 'second', unitid) returning id into er;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    res := accept_emergency_request(er)::text;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set status = 'published' where id = cp1;
    if res = 'true' then raise exception 'a hidden ad accepted emergency work'; end if;
    perform pg_temp.fl('cleaner', 'a hidden ad cannot accept emergency work', true, null);
  exception when others then reset role; perform set_config('request.jwt.claim.sub', '', true); update cleaner_profiles set status = 'published' where id = cp1; perform pg_temp.fl('cleaner', 'a hidden ad cannot accept emergency work', false, sqlstate || ' ' || sqlerrm); end;

  -- 4. moderation sticks
  begin
    perform set_config('request.jwt.claim.sub', ad::text, true); set local role authenticated;
    update cleaner_profiles set status = 'hidden' where id = cp1;
    reset role;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update cleaner_profiles set status = 'published' where id = cp1;
    reset role;
    if (select status from cleaner_profiles where id = cp1) <> 'hidden' then raise exception 'owner republished a hidden ad'; end if;
    perform set_config('request.jwt.claim.sub', ad::text, true); set local role authenticated;
    update cleaner_profiles set status = 'removed' where id = cp1;
    reset role;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update cleaner_profiles set status = 'draft' where id = cp1;
    reset role;
    if (select status from cleaner_profiles where id = cp1) <> 'removed' then raise exception 'owner left removed'; end if;
    perform set_config('request.jwt.claim.sub', ad::text, true); set local role authenticated;
    update cleaner_profiles set status = 'published' where id = cp1;
    reset role;
    if (select moderated from cleaner_profiles where id = cp1) then raise exception 'moderation flag not cleared on restore'; end if;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update cleaner_profiles set status = 'hidden' where id = cp1;
    update cleaner_profiles set status = 'published' where id = cp1;
    reset role;
    if (select status from cleaner_profiles where id = cp1) <> 'published' then raise exception 'owner can no longer hide and publish their own ad'; end if;
    perform pg_temp.fl('cleaner', 'moderation sticks until an admin restores; the owner can still hide and publish their own ad', true, null);
  exception when others then reset role; perform set_config('request.jwt.claim.sub', '', true); update cleaner_profiles set status = 'published', moderated = false where id = cp1; perform pg_temp.fl('cleaner', 'moderation sticks until an admin restores; the owner can still hide and publish their own ad', false, sqlstate || ' ' || sqlerrm); end;

  -- 5. conversation members are fixed
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into conversations (household_id, cleaner_id) values (hh, cu) returning id into cid;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update conversations set household_id = bu, checkin_sent_at = now() where id = cid;
    reset role;
    if (select household_id from conversations where id = cid) <> hh or (select checkin_sent_at from conversations where id = cid) is not null then raise exception 'members were rewritten'; end if;
    perform pg_temp.fl('cleaner', 'cannot swap or re-time the members of a conversation', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'cannot swap or re-time the members of a conversation', false, sqlstate || ' ' || sqlerrm); end;

  -- 6. trust counter counts once
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set verified_jobs_count = 0 where id = cp2;
    insert into connections (household_id, cleaner_id) values (bu, c2) returning id into cid;
    update connections set household_confirmed_at = now(), cleaner_confirmed_at = now() where id = cid;
    if (select verified_jobs_count from cleaner_profiles where id = cp2) <> 1 then raise exception 'first activation not counted'; end if;
    update connections set status = 'pending', household_confirmed_at = null, cleaner_confirmed_at = null where id = cid;
    update connections set household_confirmed_at = now(), cleaner_confirmed_at = now() where id = cid;
    if (select verified_jobs_count from cleaner_profiles where id = cp2) <> 1 then raise exception 're-activation counted again'; end if;
    perform pg_temp.fl('cleaner', 're-opening and re-confirming a connection does not raise the public counter', true, null);
  exception when others then perform pg_temp.fl('cleaner', 're-opening and re-confirming a connection does not raise the public counter', false, sqlstate || ' ' || sqlerrm); end;

  -- 7. where to go
  begin
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    select count(*) into n from cleaner_slot_units where business_id = bid;
    reset role;
    if n < 1 then raise exception 'connected cleaner sees no unit'; end if;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    select count(*) into n from cleaner_slot_units where business_id = bid;
    reset role;
    if n <> 0 then raise exception 'unconnected cleaner sees % units', n; end if;
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    perform ical_url from cleaner_slot_units limit 1;
    reset role; raise exception 'calendar link readable';
  exception when others then reset role;
    perform pg_temp.fl('cleaner', 'a connected cleaner reads unit name and address; others and the calendar link are not readable', sqlstate = '42703', sqlstate || ' ' || sqlerrm);
  end;

  -- 8. pricing rules
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into pricing_rules (service_key, model, amount_cents, active, notes) values ('cover', 'per_event', 500, false, 'secret draft rule');
    perform set_config('request.jwt.claim.sub', '', true); set local role anon;
    select count(*) into n from pricing_rules where notes = 'secret draft rule';
    reset role;
    if n <> 0 then raise exception 'anon reads an inactive rule'; end if;
    delete from pricing_rules where notes = 'secret draft rule';
    perform pg_temp.fl('anon', 'inactive pricing rules are not public', true, null);
  exception when others then reset role; perform pg_temp.fl('anon', 'inactive pricing rules are not public', false, sqlstate || ' ' || sqlerrm); end;

  -- 11. a cleaner's home is not public
  begin
    perform set_config('request.jwt.claim.sub', '', true); set local role anon;
    select count(*) into n from cleaner_profiles where status = 'published' and postcode_area is not null;
    reset role;
    if n < 1 then raise exception 'the public cannot read the postcode area'; end if;
    perform pg_temp.fl('anon', 'the public reads the 4-digit area of published ads', true, null);
  exception when others then reset role; perform pg_temp.fl('anon', 'the public reads the 4-digit area of published ads', false, sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    perform postcode from cleaner_profiles limit 1;
    reset role; perform pg_temp.fl('household', 'cannot read a cleaner''s full postcode', false, 'postcode readable');
  exception when others then reset role; perform pg_temp.fl('household', 'cannot read a cleaner''s full postcode', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    perform location from cleaner_profiles limit 1;
    reset role; perform pg_temp.fl('household', 'cannot read a cleaner''s exact location', false, 'location readable');
  exception when others then reset role; perform pg_temp.fl('household', 'cannot read a cleaner''s exact location', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    select my_cleaner_postcode() into st;
    reset role;
    if st is distinct from '7433 RB' then raise exception 'owner got %', st; end if;
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    select my_cleaner_postcode() into st;
    reset role;
    if st is not null then raise exception 'a household got a postcode: %', st; end if;
    perform pg_temp.fl('cleaner', 'the owner reads their own full postcode, nobody else gets one', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'the owner reads their own full postcode, nobody else gets one', false, sqlstate || ' ' || sqlerrm); end;

  -- 13. erasing an account
  begin
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    perform erase_user_data(hh);
    reset role; perform pg_temp.fl('household', 'users cannot call the erasure function', false, 'call worked');
  exception when others then reset role; perform pg_temp.fl('household', 'users cannot call the erasure function', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into favourites (user_id, cleaner_profile_id) values (hh, cp2) on conflict do nothing;
    set local role service_role;
    res := (erase_user_data(hh) ->> 'keep_account');
    reset role;
    if res <> 'false' then raise exception 'keep_account=%', res; end if;
    if exists (select 1 from conversations where household_id = hh) or exists (select 1 from favourites where user_id = hh) then raise exception 'content left behind'; end if;
    if (select display_name from profiles where id = hh) <> 'Verwijderde gebruiker' then raise exception 'profile not anonymised'; end if;
    perform pg_temp.fl('service', 'erasing a household removes its content and anonymises the profile', true, null);
  exception when others then reset role; perform pg_temp.fl('service', 'erasing a household removes its content and anonymises the profile', false, sqlstate || ' ' || sqlerrm); end;

  -- 14. turnover slots: reserve, give back, cancel
  declare sid uuid; begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into cleaning_slots (unit_id, business_id, source, slot_date, starts_at, ends_at, external_uid)
      values (unitid, bid, 'manual', current_date + 3, now() + interval '3 days', now() + interval '3 days 4 hours', 'probe-slot-1') returning id into sid;
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    update cleaning_slots set status = 'reserved', reserved_by = cp2 where id = sid;
    reset role;
    if (select count(*) from work_records where reference_id = sid and outcome = 'scheduled') <> 1 then raise exception 'no scheduled work after reserving'; end if;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update cleaning_slots set status = 'open', reserved_by = null where id = sid;
    get diagnostics n = row_count;
    reset role;
    if n <> 0 or (select status from cleaning_slots where id = sid) <> 'reserved' then raise exception 'a cleaner who is not connected changed the slot'; end if;
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    update cleaning_slots set status = 'open', reserved_by = null where id = sid;
    reset role;
    if (select status from cleaning_slots where id = sid) <> 'open' then raise exception 'the cleaner could not give the slot back'; end if;
    if (select count(*) from work_records where reference_id = sid and outcome = 'scheduled') <> 0 then raise exception 'work stayed scheduled after release'; end if;
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    update cleaning_slots set status = 'cancelled' where id = sid;
    reset role;
    if (select status from cleaning_slots where id = sid) <> 'cancelled' then raise exception 'the business could not cancel the slot'; end if;
    perform pg_temp.fl('cleaner', 'reserve, give back and cancel a turnover slot; work records follow', true, null);
  exception when others then reset role; perform pg_temp.fl('cleaner', 'reserve, give back and cancel a turnover slot; work records follow', false, sqlstate || ' ' || sqlerrm); end;

  -- 15. signed-in-only functions
  begin
    perform set_config('request.jwt.claim.sub', '', true); set local role anon;
    perform accept_emergency_request(gen_random_uuid());
    reset role; perform pg_temp.fl('anon', 'cover and work-record functions are not callable without signing in', false, 'call worked');
  exception when others then reset role; perform pg_temp.fl('anon', 'cover and work-record functions are not callable without signing in', sqlstate = '42501', sqlstate); end;

  -- 17. pricing inactive, search_path
  begin
    if exists (select 1 from settings where key = 'household_fee_cents' and value <> '0'::jsonb) then raise exception 'household price is not 0'; end if;
    if exists (select 1 from settings where key = 'emergency_fee_cents' and ((value ->> 'household_incl_btw')::int <> 0 or (value ->> 'business_excl_btw')::int <> 0)) then raise exception 'emergency fee is not 0'; end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and 'search_path=public' = any (p.proconfig)) then raise exception 'a definer function still has the plain public search_path'; end if;
    if exists (select 1 from pricing_rules where active) then raise exception 'a pricing rule is active'; end if;
    perform pg_temp.fl('service', 'no price is set: household fee 0, emergency fees 0, no active pricing rule, definer functions use "public, pg_temp"', true, null);
  exception when others then perform pg_temp.fl('service', 'no price is set: household fee 0, emergency fees 0, no active pricing rule, definer functions use "public, pg_temp"', false, sqlstate || ' ' || sqlerrm); end;

  -- 18. meetings: propose another time, answer, withdraw
  declare mid uuid; begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into meeting_requests (household_id, cleaner_profile_id, type, proposed_weekday, proposed_block, message) values (hh, cp1, 'in_person', 2, 'morning', 'hello') returning id into mid;
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    update meeting_requests set status = 'rescheduled', proposed_weekday = 4, proposed_block = 'evening', household_id = bu, message = 'tampered' where id = mid;
    reset role;
    if (select household_id from meeting_requests where id = mid) <> hh or (select message from meeting_requests where id = mid) <> 'hello' then raise exception 'the cleaner changed who or what the request is'; end if;
    if (select proposed_weekday from meeting_requests where id = mid) <> 4 or (select status::text from meeting_requests where id = mid) <> 'rescheduled' then raise exception 'proposal not stored'; end if;
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    update meeting_requests set status = 'accepted' where id = mid;
    get diagnostics n = row_count;
    reset role;
    if n <> 0 then raise exception 'the household updated the table directly'; end if;
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    res := (answer_meeting_proposal(mid, true) ->> 'result');
    reset role;
    if res <> 'accepted' or (select status::text from meeting_requests where id = mid) <> 'accepted' then raise exception 'answer returned %', res; end if;
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    res := (answer_meeting_proposal(mid, false) ->> 'result');
    reset role;
    if res <> 'not_allowed' then raise exception 'another user answered a proposal'; end if;
    perform set_config('request.jwt.claim.sub', hh::text, true); set local role authenticated;
    res := (withdraw_meeting_request(mid) ->> 'result');
    reset role;
    if res <> 'withdrawn' or (select status::text from meeting_requests where id = mid) <> 'declined' then raise exception 'withdraw returned %', res; end if;
    perform pg_temp.fl('household', 'meetings: cleaner proposes another time, household answers or withdraws, nobody rewrites the request', true, null);
  exception when others then reset role; perform pg_temp.fl('household', 'meetings: cleaner proposes another time, household answers or withdraws, nobody rewrites the request', false, sqlstate || ' ' || sqlerrm); end;

  -- 19. connections, retention, reviews, school VOG, awarded address
  begin
    perform set_config('request.jwt.claim.sub', cu::text, true); set local role authenticated;
    insert into connections (household_id, cleaner_id, cleaner_confirmed_at) values (bu, cu, now());
    reset role; perform pg_temp.fl('cleaner', 'a cleaner cannot open a deal with someone they have no conversation with', false, 'insert worked');
  exception when others then reset role; perform pg_temp.fl('cleaner', 'a cleaner cannot open a deal with someone they have no conversation with', sqlstate = '42501', sqlstate); end;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into conversations (household_id, cleaner_id, created_at, last_message_at) values (bu, cu, now() - interval '3 years', now() - interval '3 years') returning id into cid;
    set local role service_role;
    perform purge_old_records();
    reset role;
    if exists (select 1 from conversations where id = cid) then raise exception 'old conversation not purged'; end if;
    perform pg_temp.fl('service', 'old conversations are purged by the retention function', true, null);
  exception when others then reset role; perform pg_temp.fl('service', 'old conversations are purged by the retention function', false, sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    insert into reviews (connection_id, author_id, subject_id, rating, body, hidden)
      select c.id, c.household_id, c.cleaner_id, 5, 'hidden review', true from connections c limit 1;
    perform set_config('request.jwt.claim.sub', '', true); set local role anon;
    select count(*) into n from reviews where body = 'hidden review';
    reset role;
    if n <> 0 then raise exception 'a hidden review is public'; end if;
    perform pg_temp.fl('anon', 'a hidden review is not public', true, null);
  exception when others then reset role; perform pg_temp.fl('anon', 'a hidden review is not public', false, sqlstate || ' ' || sqlerrm); end;

  -- 20. review fixes (0028): moderated ads cannot be deleted, removed jobs stay removed, distances without the exact location
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set status = 'removed', moderated = true where id = cp2;
    perform set_config('request.jwt.claim.sub', c2::text, true); set local role authenticated;
    delete from cleaner_profiles where id = cp2;
    reset role;
    if not exists (select 1 from cleaner_profiles where id = cp2) then raise exception 'a moderated ad was deleted by its owner'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set status = 'published', moderated = false where id = cp2;
    perform pg_temp.fl('cleaner', 'a moderated ad cannot be deleted and re-created by its owner', true, null);
  exception when others then reset role; perform set_config('request.jwt.claim.sub', '', true); update cleaner_profiles set status = 'published', moderated = false where id = cp2; perform pg_temp.fl('cleaner', 'a moderated ad cannot be deleted and re-created by its owner', false, sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    select id into jid from jobs where business_id = bid and status not in ('filled', 'removed') limit 1;
    if jid is null then raise exception 'no job to test with'; end if;
    update jobs set status = 'removed' where id = jid;
    perform set_config('request.jwt.claim.sub', bu::text, true); set local role authenticated;
    update jobs set status = 'published' where id = jid;
    reset role; perform pg_temp.fl('business', 'an owner cannot put a removed job back online', false, 'update worked');
  exception when others then reset role; perform pg_temp.fl('business', 'an owner cannot put a removed job back online', sqlerrm like '%job is removed%', sqlstate || ' ' || sqlerrm); end;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    update cleaner_profiles set status = 'published', location = 'SRID=4326;POINT(6.2234 52.3012)' where id = cp2;
    set local role anon;
    select distance_km into dist from cleaner_distances(6.2234, 52.3012) where id = cp2;
    reset role;
    if dist is null then raise exception 'no distance returned for a published ad'; end if;
    set local role anon;
    begin perform location from cleaner_profiles limit 1; reset role; raise exception 'exact location is readable'; exception when insufficient_privilege then reset role; end;
    perform pg_temp.fl('anon', 'distances work for visitors while the exact location stays unreadable (grid snapping is PostGIS-only, not checked here)', true, null);
  exception when others then reset role; perform pg_temp.fl('anon', 'distances work for visitors while the exact location stays unreadable (grid snapping is PostGIS-only, not checked here)', false, sqlstate || ' ' || sqlerrm); end;
end $$;

insert into probe_results select 'privacy', who, label, got = want, case when got = want then null else 'got ' || got || ', expected ' || want end from pcheck;

select case when ok then 'PASS' else 'FAIL' end || '  ' || kind || '  ' || who || '  ' || subject || coalesce('  — ' || detail, '')
  from probe_results where not ok or kind in ('flow','privacy') order by ok, kind, who, subject;
select 'summary: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' failed, of ' || count(*) from probe_results;
