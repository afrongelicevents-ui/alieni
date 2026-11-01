-- Security review of business v2 (brief v2 §13): fixes.

-- ========== FINDING 1 (high): server-only functions callable by anyone ==========
-- Security-definer helpers used by crons/triggers were executable by the
-- authenticated/anon roles via RPC, leaking Mollie customer ids and letting
-- anyone burn invoice numbers. Only the service role may call them.
do $$
declare fn text;
begin
  foreach fn in array array[
    'next_invoice_number()',
    'checkin_candidates()',
    'businesses_due_for_billing()',
    'expire_emergency_requests()',
    'has_active_connection(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ========== FINDING 3 (medium): cleaners could edit any open slot ==========
-- Connected cleaners may only (a) reserve an open slot for themselves or
-- (b) mark their own reservation done; never change times, unit or status
-- otherwise. Businesses and admins keep full control.
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
  raise exception 'invalid slot transition';
end;
$$;
create trigger cleaning_slots_guard_cleaner_update
  before update on cleaning_slots
  for each row execute function guard_cleaner_slot_update();

-- ========== FINDING 4 (low): emergency request spam ==========
create or replace function check_emergency_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from emergency_requests
      where requester_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'emergency request limit reached (3 per day)';
  end if;
  return new;
end;
$$;
create trigger emergency_requests_rate_limit
  before insert on emergency_requests
  for each row execute function check_emergency_rate();
