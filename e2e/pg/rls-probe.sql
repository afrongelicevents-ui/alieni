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
do $$
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
  -- a household and a cleaner can read the published job (and its company) through the jobs board
  perform set_config('request.jwt.claim.sub', (select uid::text from probe_users where role = 'cleaner'), true);
  begin
    set local role authenticated;
    perform 1 from jobs j join business_profiles bp on bp.id = j.business_id where j.status = 'published';
    reset role;
    insert into probe_results values ('flow', 'cleaner', 'read published job with company', true, null);
  exception when others then
    reset role;
    insert into probe_results values ('flow', 'cleaner', 'read published job with company', false, sqlstate || ' ' || sqlerrm);
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

select case when ok then 'PASS' else 'FAIL' end || '  ' || kind || '  ' || who || '  ' || subject || coalesce('  — ' || detail, '')
  from probe_results where not ok or kind = 'flow' order by ok, kind, who, subject;
select 'summary: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' failed, of ' || count(*) from probe_results;
