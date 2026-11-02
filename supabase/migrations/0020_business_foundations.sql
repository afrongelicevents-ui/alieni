-- Business side, Phase 1: foundations.
--   1. service_catalog  — which services are switched on, per business type
--   2. pricing_rules    — configurable prices; default model 'none' (nothing is charged)
--   3. fee_events       — every potentially billable moment, recorded at the rule's amount (€0 by default)
--   4. invoice_lines    — breakdown per service (used by the billing run in a later phase)
--   5. work_records     — the central record of work performed
--   6. cleaner work types
-- Purely additive: no table dropped, no row deleted. Nothing in here charges anyone.

-- ========== 1. service catalogue ==========
create table if not exists service_catalog (
  service_key text primary key check (service_key in ('connect', 'cover', 'turnover', 'oneoff', 'contract')),
  enabled boolean not null default false,
  business_types business_type[] not null default '{}', -- empty = all types
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);
alter table service_catalog enable row level security;
create policy "catalogue is readable" on service_catalog for select using (true);
create policy "admin edits catalogue" on service_catalog for update using (is_admin()) with check (is_admin());
create policy "admin inserts catalogue" on service_catalog for insert with check (is_admin());

-- Services that exist today stay on; the two unbuilt ones start off.
insert into service_catalog (service_key, enabled, sort_order) values
  ('connect',  true,  0),
  ('cover',    true,  1),
  ('turnover', true,  2),
  ('oneoff',   false, 3),
  ('contract', false, 4)
on conflict (service_key) do nothing;

create or replace function service_enabled_for(p_service text, p_type business_type) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select enabled and (cardinality(business_types) = 0 or p_type = any(business_types))
    from service_catalog where service_key = p_service
  ), false);
$$;

-- ========== 2. pricing rules (configurable; nothing applies until an active rule exists) ==========
create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_key text not null references service_catalog (service_key),
  business_type business_type, -- null = all types
  model text not null default 'none' check (model in ('none', 'monthly_per_unit', 'per_event', 'per_booking', 'percent')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  percent numeric(5,2) check (percent is null or (percent >= 0 and percent <= 100)),
  unit text, -- listing / room / location / site / event / booking
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null
);
create index if not exists pricing_rules_lookup_idx on pricing_rules (service_key, business_type, active, valid_from);
alter table pricing_rules enable row level security;
create policy "rules are readable" on pricing_rules for select using (true);
create policy "admin manages rules" on pricing_rules for all using (is_admin()) with check (is_admin());

-- The previous per-unit placeholder prices are kept for reference but INACTIVE,
-- so they no longer apply anywhere. Activate or replace them in Admin → Pricing.
insert into pricing_rules (service_key, business_type, model, amount_cents, unit, active, notes)
select 'connect', k::business_type, 'monthly_per_unit', (v)::integer,
       case k when 'airbnb' then 'listing' when 'hotel' then 'room' when 'school' then 'site' else 'location' end,
       false, 'Placeholder from the earlier per-unit model. Inactive until approved.'
from settings s, jsonb_each_text(s.value) as e(k, v)
where s.key = 'business_unit_prices_cents'
  and not exists (select 1 from pricing_rules where notes like 'Placeholder from the earlier per-unit model%');

/** The rule that applies today for a service + business type (type-specific wins over 'all'). */
create or replace function active_pricing_rule(p_service text, p_type business_type)
returns pricing_rules language sql stable security definer set search_path = public as $$
  select * from pricing_rules
  where service_key = p_service and active
    and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
    and (business_type = p_type or business_type is null)
  order by business_type nulls last, valid_from desc
  limit 1;
$$;

-- ========== 3. fee events (tracking only; no charge, no obligation) ==========
create table if not exists fee_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete cascade,
  service_key text not null references service_catalog (service_key),
  event_type text not null, -- cover_accepted, turnover_completed, connection_activated, quote_accepted, contract_month
  reference_table text,
  reference_id uuid,
  occurred_at timestamptz not null default now(),
  rule_id uuid references pricing_rules (id) on delete set null,
  model text not null default 'none',
  amount_cents integer not null default 0,
  btw_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'invoiced', 'waived')),
  waived_reason text,
  invoice_line_id uuid,
  created_at timestamptz not null default now(),
  unique (event_type, reference_table, reference_id)
);
create index if not exists fee_events_business_idx on fee_events (business_id, occurred_at desc);
alter table fee_events enable row level security;
create policy "business reads own fee events" on fee_events for select
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()));
create policy "admin reads fee events" on fee_events for select using (is_admin());
create policy "admin updates fee events" on fee_events for update using (is_admin()) with check (is_admin());
-- no insert policy: rows are written by the system functions below only

/** Record a billable moment at the amount of the active rule (0 when there is none). Idempotent per reference. */
create or replace function record_fee_event(p_business_id uuid, p_service text, p_event_type text, p_ref_table text, p_ref_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  bt business_type;
  r pricing_rules;
  amt integer := 0;
  btw integer := 0;
  new_id uuid;
begin
  select business_type into bt from business_profiles where id = p_business_id;
  r := active_pricing_rule(p_service, bt);
  if r.id is not null and r.model in ('per_event', 'per_booking') then
    amt := r.amount_cents;
    btw := round(amt * 0.21);
  end if;
  insert into fee_events (business_id, service_key, event_type, reference_table, reference_id, rule_id, model, amount_cents, btw_cents)
  values (p_business_id, p_service, p_event_type, p_ref_table, p_ref_id, r.id, coalesce(r.model, 'none'), amt, btw)
  on conflict (event_type, reference_table, reference_id) do nothing
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function record_fee_event(uuid, text, text, text, uuid) from public, anon, authenticated;

-- ========== 4. invoice lines (schema only; the billing run fills these in a later phase) ==========
create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  service_key text references service_catalog (service_key),
  description text not null,
  quantity integer not null default 1,
  unit_cents integer not null default 0,
  net_cents integer not null default 0,
  btw_cents integer not null default 0,
  created_at timestamptz not null default now()
);
alter table invoice_lines enable row level security;
create policy "invoice lines follow the invoice" on invoice_lines for select using (
  exists (select 1 from invoices i where i.id = invoice_id and (
    i.household_id = auth.uid()
    or exists (select 1 from business_profiles bp where bp.id = i.business_id and bp.user_id = auth.uid())
  )) or is_admin()
);

-- ========== 5. work records (central log of work performed) ==========
create table if not exists work_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references business_profiles (id) on delete cascade,
  household_id uuid references profiles (id) on delete cascade,
  cleaner_profile_id uuid references cleaner_profiles (id) on delete set null,
  service_key text not null references service_catalog (service_key),
  reference_table text,
  reference_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  photo_path text,
  business_confirmed_at timestamptz,
  outcome text not null default 'scheduled' check (outcome in ('scheduled', 'done', 'no_show', 'cancelled', 'disputed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reference_table, reference_id)
);
create index if not exists work_records_business_idx on work_records (business_id, scheduled_start desc);
create index if not exists work_records_cleaner_idx on work_records (cleaner_profile_id, scheduled_start desc);
alter table work_records enable row level security;
create policy "business reads own work" on work_records for select
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()));
create policy "household reads own work" on work_records for select using (household_id = auth.uid());
create policy "cleaner reads own work" on work_records for select
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
create policy "admin reads work" on work_records for select using (is_admin());
-- writes only through the functions below

/** Business confirms or disputes a piece of work (within its own records). */
create or replace function review_work_record(p_record_id uuid, p_ok boolean, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rec work_records;
begin
  select * into rec from work_records where id = p_record_id;
  if not found then return false; end if;
  if not (exists (select 1 from business_profiles bp where bp.id = rec.business_id and bp.user_id = auth.uid())
          or rec.household_id = auth.uid() or is_admin()) then
    raise exception 'not your work record';
  end if;
  update work_records
    set business_confirmed_at = case when p_ok then now() else business_confirmed_at end,
        outcome = case when p_ok then (case when outcome = 'scheduled' then 'done' else outcome end) else 'disputed' end,
        notes = coalesce(nullif(p_note, ''), notes),
        updated_at = now()
    where id = p_record_id;
  -- a disputed event is parked (waived) until an admin decides
  if not p_ok then
    update fee_events set status = 'waived', waived_reason = 'disputed by customer'
      where reference_table = rec.reference_table and reference_id = rec.reference_id and status = 'pending';
  end if;
  return true;
end;
$$;

/** Cleaner marks their own record started / completed. */
create or replace function progress_work_record(p_record_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rec work_records; me uuid;
begin
  select id into me from cleaner_profiles where user_id = auth.uid();
  select * into rec from work_records where id = p_record_id and cleaner_profile_id = me;
  if not found then return false; end if;
  if p_action = 'start' then
    update work_records set started_at = coalesce(started_at, now()), updated_at = now() where id = p_record_id;
  elsif p_action = 'complete' then
    update work_records set completed_at = coalesce(completed_at, now()), outcome = case when outcome = 'scheduled' then 'done' else outcome end, updated_at = now() where id = p_record_id;
  else
    return false;
  end if;
  return true;
end;
$$;

-- ---- system hooks: existing flows feed the records and events automatically ----

-- Turnover slot reserved → scheduled work; done → completed work + fee event.
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
    update work_records set outcome = 'cancelled', updated_at = now() where reference_table = 'cleaning_slots' and reference_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists cleaning_slots_work on cleaning_slots;
create trigger cleaning_slots_work
  after update on cleaning_slots
  for each row execute function work_from_cleaning_slot();

-- Emergency / cover accepted → scheduled work (+ fee event for businesses).
create or replace function work_from_emergency() returns trigger
language plpgsql security definer set search_path = public as $$
declare bp_id uuid;
begin
  if new.status = 'accepted' and (old.status is distinct from 'accepted') then
    select id into bp_id from business_profiles where user_id = new.requester_id;
    insert into work_records (business_id, household_id, cleaner_profile_id, service_key, reference_table, reference_id, scheduled_start, scheduled_end, outcome)
    values (bp_id, case when bp_id is null then new.requester_id end, new.accepted_by, 'cover', 'emergency_requests', new.id, new.window_start, new.window_end, 'scheduled')
    on conflict (reference_table, reference_id) do nothing;
    if bp_id is not null then
      perform record_fee_event(bp_id, 'cover', 'cover_accepted', 'emergency_requests', new.id);
    end if;
  elsif new.status in ('cancelled', 'expired') and (old.status is distinct from new.status) then
    update work_records set outcome = 'cancelled', updated_at = now() where reference_table = 'emergency_requests' and reference_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists emergency_requests_work on emergency_requests;
create trigger emergency_requests_work
  after update on emergency_requests
  for each row execute function work_from_emergency();

-- Business ↔ cleaner connection activated → connect event (model decides whether anything applies).
create or replace function fee_from_business_connection() returns trigger
language plpgsql security definer set search_path = public as $$
declare bp_id uuid;
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    select id into bp_id from business_profiles where user_id = new.household_id;
    if bp_id is not null then
      perform record_fee_event(bp_id, 'connect', 'connection_activated', 'connections', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists connections_fee on connections;
create trigger connections_fee
  after update on connections
  for each row execute function fee_from_business_connection();

-- ========== 6. cleaner work types ==========
alter table cleaner_profiles
  add column if not exists work_types text[] not null default '{household_regular}';
-- allowed values are validated in the app and here:
alter table cleaner_profiles drop constraint if exists cleaner_work_types_check;
alter table cleaner_profiles add constraint cleaner_work_types_check check (
  work_types <@ array['household_regular', 'move_in_out', 'deep', 'commercial_contract', 'turnover', 'emergency_cover']::text[]
);
-- Existing profiles: derive from what they already chose.
update cleaner_profiles set work_types =
  array_remove(array[
    case when 'household' = any(job_types) then 'household_regular' end,
    case when job_types && array['airbnb','hotel'] then 'turnover' end,
    case when job_types && array['office','restaurant','school'] then 'commercial_contract' end,
    case when 'emergency' = any(job_types) then 'emergency_cover' end
  ], null)
where work_types = '{household_regular}';

-- ========== 7. new business accounts: no price unless an active monthly rule exists ==========
-- Previously the placeholder per-unit price from settings was copied onto every new
-- business profile. From now on the locked price comes from Admin → Pricing (an active
-- 'monthly_per_unit' rule for the type) and stays NULL otherwise: nothing is owed.
create or replace function lock_business_unit_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare r pricing_rules;
begin
  new.unit_price_cents := null;
  if new.business_type is not null then
    r := active_pricing_rule('connect', new.business_type);
    if r.id is not null and r.model = 'monthly_per_unit' then
      new.unit_price_cents := r.amount_cents;
    end if;
  end if;
  return new;
end;
$$;
-- (trigger business_profiles_lock_price from 0018 keeps pointing at this function)

-- Businesses may read the work-record functions; cleaners the progress one. Both check ownership inside.
grant execute on function review_work_record(uuid, boolean, text) to authenticated;
grant execute on function progress_work_record(uuid, text) to authenticated;
revoke execute on function review_work_record(uuid, boolean, text) from anon;
revoke execute on function progress_work_record(uuid, text) from anon;
