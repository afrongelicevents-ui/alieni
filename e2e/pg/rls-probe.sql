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
    insert into jobs (business_id, status, space_type, postcode, frequency, description, budget_cents)
      values (bid, 'published', 'office', '7433 RB', 'weekly', 'Weekly office cleaning, evenings.', 2000);
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
select pg_temp.chk('anon cannot update via the view', 'anon', 'anon', null, $q$with u as (update business_public set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 42501');
select pg_temp.chk('household cannot update via the view', 'authenticated', 'household', :'hh', $q$with u as (update business_public set company_name = 'X' returning 1) select count(*) from u$q$, 'ERR 42501');
select pg_temp.chk('business 2 cannot rename business 1 via the view', 'authenticated', 'business 2', :'b2', $q$with u as (update business_public set company_name = 'X' where company_name = 'Probe BV' returning 1) select count(*) from u$q$, 'ERR 42501');
select pg_temp.chk('business 2 cannot delete via the view', 'authenticated', 'business 2', :'b2', $q$with d as (delete from business_public returning 1) select count(*) from d$q$, 'ERR 42501');
select pg_temp.chk('business 2 cannot insert via the view', 'authenticated', 'business 2', :'b2', $q$with i as (insert into business_public (company_name) values ('X') returning 1) select count(*) from i$q$, 'ERR 42501');
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

insert into probe_results select 'privacy', who, label, got = want, case when got = want then null else 'got ' || got || ', expected ' || want end from pcheck;

select case when ok then 'PASS' else 'FAIL' end || '  ' || kind || '  ' || who || '  ' || subject || coalesce('  — ' || detail, '')
  from probe_results where not ok or kind in ('flow','privacy') order by ok, kind, who, subject;
select 'summary: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' failed, of ' || count(*) from probe_results;
