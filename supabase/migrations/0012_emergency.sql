-- Business v2 (M5): emergency (same-day) cleaners. First cleaner to accept
-- wins; nothing is charged unless someone accepts; the request's exact
-- address is visible only to the requester and the accepting cleaner, and
-- is deleted 7 days after the job (owner's data-minimisation decision).

create type emergency_status as enum ('searching', 'accepted', 'expired', 'cancelled');

create table emergency_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  requester_type text not null check (requester_type in ('household', 'business')),
  address_line text, -- deleted 7 days after window_end
  postcode text not null check (postcode ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
  city text not null,
  location geography(point, 4326),
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  hours numeric(3,1) not null check (hours between 1 and 12),
  tasks text not null check (char_length(tasks) between 5 and 1000),
  status emergency_status not null default 'searching',
  accepted_by uuid references cleaner_profiles (id),
  accepted_at timestamptz,
  fee_cents integer, -- fixed booking fee, charged only once accepted
  mollie_payment_id text unique,
  created_at timestamptz not null default now()
);
create index emergency_requests_status_idx on emergency_requests (status, window_start);

alter table emergency_requests enable row level security;

create policy "requester manages own request" on emergency_requests for all
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());
create policy "admin reads requests" on emergency_requests for select using (is_admin());

-- Opted-in emergency cleaners see open requests WITHOUT the street address
-- (through the view below); the accepting cleaner sees everything.
create policy "accepting cleaner reads request" on emergency_requests for select
  using (accepted_by = (select id from cleaner_profiles where user_id = auth.uid()));

create or replace view emergency_requests_open as
  select id, requester_type, postcode, city, location, window_start, window_end, hours, tasks, created_at
  from emergency_requests
  where status = 'searching'
    and exists (select 1 from cleaner_profiles cp where cp.user_id = auth.uid() and cp.emergency_opt_in);

-- First to accept wins: a single UPDATE guarded by status = 'searching'
-- is atomic under row locking, so two cleaners cannot both win.
create or replace function accept_emergency_request(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  cp cleaner_profiles;
  updated integer;
begin
  select * into cp from cleaner_profiles where user_id = auth.uid() and emergency_opt_in;
  if not found then return false; end if;
  update emergency_requests
    set status = 'accepted', accepted_by = cp.id, accepted_at = now()
    where id = p_request_id and status = 'searching' and window_start > now();
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

-- Housekeeping for the cron: expire unanswered requests, delete addresses.
create or replace function expire_emergency_requests() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update emergency_requests set status = 'expired'
    where status = 'searching' and window_start <= now();
  get diagnostics n = row_count;
  update emergency_requests set address_line = null
    where address_line is not null and window_end < now() - interval '7 days';
  return n;
end;
$$;
