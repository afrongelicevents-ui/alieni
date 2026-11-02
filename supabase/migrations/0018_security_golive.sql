-- Security review of the go-live build (findings 1–8). Purely additive:
-- no tables or data are dropped.

-- ========== helper: "system" context for definer functions/triggers ==========
create or replace function alieni_is_system() returns boolean
language sql stable as $$
  select auth.uid() is null or is_admin() or current_setting('alieni.system', true) = 'on';
$$;

-- ========== FINDING 1 + 4: Mollie / billing columns are server-only ==========
-- Users keep the same visibility as before on everything EXCEPT the Mollie
-- identifiers, which are now neither readable nor writable through the API
-- by regular users (the webhook and payment actions use the service role).
revoke select, update on profiles from authenticated, anon;
grant select (id, role, display_name, city, locale, created_at) on profiles to authenticated, anon;
grant update (display_name, city, locale, role) on profiles to authenticated; -- role still guarded by trigger
grant insert on profiles to authenticated;

revoke select, update, insert on business_profiles from authenticated, anon;
grant select (id, user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name,
              unit_count, unit_price_cents, pending_unit_count, billing_started_at, billing_paused_at, billing_ended_at,
              payment_failed_at, created_at) on business_profiles to authenticated, anon;
grant insert (user_id, company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name, unit_count)
  on business_profiles to authenticated;
grant update (company_name, kvk_number, btw_number, business_type, contact_first_name, contact_last_name,
              unit_count, pending_unit_count, billing_ended_at) on business_profiles to authenticated;

-- The locked unit price always comes from settings at creation (never from the client).
create or replace function lock_business_unit_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare prices jsonb;
begin
  select value into prices from settings where key = 'business_unit_prices_cents';
  if new.business_type is not null then
    new.unit_price_cents := coalesce((prices ->> new.business_type::text)::integer, new.unit_price_cents);
  end if;
  return new;
end;
$$;
drop trigger if exists business_profiles_lock_price on business_profiles;
create trigger business_profiles_lock_price
  before insert on business_profiles
  for each row execute function lock_business_unit_price();

-- ========== FINDING 2: connections — only your own confirmation, no self-activation ==========
create or replace function guard_connection_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if alieni_is_system() then
    return new;
  end if;
  -- server-managed columns
  new.mollie_customer_id := old.mollie_customer_id;
  new.mollie_subscription_id := old.mollie_subscription_id;
  new.started_at := old.started_at;
  new.household_id := old.household_id;
  new.cleaner_id := old.cleaner_id;
  -- each party may only touch its own confirmation column
  if auth.uid() = old.household_id then
    new.cleaner_confirmed_at := old.cleaner_confirmed_at;
  elsif auth.uid() = old.cleaner_id then
    new.household_confirmed_at := old.household_confirmed_at;
  else
    raise exception 'not a party of this connection';
  end if;
  -- status: users may end, or re-open an ended connection as pending (fresh round)
  if new.status is distinct from old.status then
    if new.status = 'ended' then
      new.ended_at := coalesce(new.ended_at, now());
    elsif new.status = 'pending' and old.status = 'ended' then
      new.ended_at := null;
      new.started_at := null;
      -- re-opening resets both confirmations except the caller's
      if auth.uid() = old.household_id then new.cleaner_confirmed_at := null; else new.household_confirmed_at := null; end if;
    else
      raise exception 'invalid connection status change';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists connections_guard_update on connections;
create trigger connections_guard_update
  before update on connections
  for each row execute function guard_connection_update();
-- The activation trigger (0015) must run AFTER the guard: trigger names fire alphabetically.
drop trigger if exists connections_activate on connections;
create trigger connections_zz_activate
  before update on connections
  for each row execute function activate_connection_when_both_confirm();
-- Inserts: a party may insert only its own confirmation and status pending/ended.
create or replace function guard_connection_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if alieni_is_system() then return new; end if;
  new.mollie_customer_id := null; new.mollie_subscription_id := null; new.started_at := null;
  if auth.uid() = new.household_id then new.cleaner_confirmed_at := null;
  elsif auth.uid() = new.cleaner_id then new.household_confirmed_at := null;
  else raise exception 'not a party of this connection'; end if;
  if new.status not in ('pending', 'ended') then new.status := 'pending'; end if;
  return new;
end;
$$;
drop trigger if exists connections_guard_insert on connections;
create trigger connections_guard_insert
  before insert on connections
  for each row execute function guard_connection_insert();

-- ========== FINDING 3: contact masking in the database itself ==========
create or replace function mask_contacts_sql(input text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(input,
                 '[A-Za-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,}', '•⁠•⁠•⁠•⁠•', 'gi'),
               '(https?://|www\.)[^\s]+', '•⁠•⁠•⁠•⁠•', 'gi'),
             '(wa\.me|t\.me)/[^\s]+', '•⁠•⁠•⁠•⁠•', 'gi'),
           '(\+|00)?[0-9][0-9 \-\.()]{6,}[0-9]', '•⁠•⁠•⁠•⁠•', 'g');
$$;
create or replace function enforce_message_masking() returns trigger
language plpgsql security definer set search_path = public as $$
declare conv conversations;
begin
  select * into conv from conversations where id = new.conversation_id;
  if not has_active_connection(conv.household_id, conv.cleaner_id) then
    new.masked := true;
    new.body := mask_contacts_sql(new.body);
  end if;
  return new;
end;
$$;

-- ========== FINDING 7: only the cleaner responds to a meeting request ==========
drop policy if exists "cleaner responds" on meeting_requests;
create policy "cleaner responds" on meeting_requests for update
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));

-- ========== FINDING 8: emergency — 4-digit area in the open view; requester cannot self-assign ==========
create or replace view emergency_requests_open as
  select id, requester_type, left(postcode, 4) as postcode, city, window_start, window_end, hours, tasks, created_at
  from emergency_requests
  where status = 'searching'
    and window_start > now()
    and exists (select 1 from cleaner_profiles cp where cp.user_id = auth.uid() and cp.emergency_opt_in);
grant select on emergency_requests_open to authenticated;

create or replace function guard_emergency_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if alieni_is_system() then return new; end if;
  -- requester may only cancel a searching request (and edit text fields before acceptance)
  new.accepted_by := old.accepted_by; new.accepted_at := old.accepted_at; new.fee_cents := old.fee_cents;
  new.mollie_payment_id := old.mollie_payment_id; new.requester_id := old.requester_id;
  if new.status is distinct from old.status and not (old.status = 'searching' and new.status = 'cancelled') then
    raise exception 'invalid emergency status change';
  end if;
  return new;
end;
$$;
drop trigger if exists emergency_requests_guard_update on emergency_requests;
create trigger emergency_requests_guard_update
  before update on emergency_requests
  for each row execute function guard_emergency_update();

-- accept runs as "system" so the guard lets it through
create or replace function accept_emergency_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  cp cleaner_profiles;
  updated integer;
begin
  select * into cp from cleaner_profiles where user_id = auth.uid() and emergency_opt_in;
  if not found then return false; end if;
  perform set_config('alieni.system', 'on', true);
  update emergency_requests
    set status = 'accepted', accepted_by = cp.id, accepted_at = now(),
        fee_cents = case when requester_type = 'household'
          then coalesce((select (value ->> 'household_incl_btw')::integer from settings where key = 'emergency_fee_cents'), 995)
          else coalesce((select (value ->> 'business_excl_btw')::integer from settings where key = 'emergency_fee_cents'), 1495) end
    where id = p_request_id and status = 'searching' and window_start > now();
  get diagnostics updated = row_count;
  perform set_config('alieni.system', 'off', true);
  return updated = 1;
end;
$$;

-- ========== cleaner profiles: protected columns ==========
create or replace function guard_cleaner_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if alieni_is_system() then return new; end if;
  new.user_id := old.user_id;
  if new.status not in ('draft', 'published', 'hidden') then new.status := old.status; end if; -- 'removed' is admin-only
  return new;
end;
$$;
drop trigger if exists cleaner_profiles_guard_update on cleaner_profiles;
create trigger cleaner_profiles_guard_update
  before update on cleaner_profiles
  for each row execute function guard_cleaner_profile_update();

-- ========== vog bucket: size/mime limits like the others ==========
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
  where id = 'vog';

-- ========== meeting request flooding backstop (max 20 per household per day) ==========
create or replace function check_meeting_request_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from meeting_requests
      where household_id = auth.uid() and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'meeting request limit reached (20 per day)';
  end if;
  return new;
end;
$$;
drop trigger if exists meeting_requests_rate_limit on meeting_requests;
create trigger meeting_requests_rate_limit
  before insert on meeting_requests
  for each row execute function check_meeting_request_rate();
