-- Business v2 (M4): calendar sync — iCal feeds per unit, cleaning slots at
-- every checkout, reservations, reminders, manual hotel turnovers.

create type slot_status as enum ('open', 'reserved', 'done', 'cancelled');
create type slot_source as enum ('ical', 'manual');

alter table business_units
  add column checkout_time time not null default '11:00',
  add column checkin_time time not null default '15:00',
  add column ical_last_synced_at timestamptz,
  add column ical_last_error text;

create table cleaning_slots (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references business_units (id) on delete cascade,
  business_id uuid not null references business_profiles (id) on delete cascade,
  source slot_source not null,
  external_uid text, -- iCal UID; unique per unit so re-syncs are idempotent
  slot_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status slot_status not null default 'open',
  reserved_by uuid references cleaner_profiles (id) on delete set null,
  reserved_at timestamptz,
  offered_to_others_at timestamptz, -- unreserved 48h before checkout
  reminder_sent_at timestamptz,
  done_at timestamptz,
  done_photo_path text, -- private bucket, optional
  created_at timestamptz not null default now(),
  unique (unit_id, external_uid)
);
create index cleaning_slots_business_date_idx on cleaning_slots (business_id, slot_date);
create index cleaning_slots_reserved_idx on cleaning_slots (reserved_by, slot_date);

-- A cleaner is "connected" to a business when an active connection exists
-- between the business user and the cleaner user.
create or replace function cleaner_connected_to_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from connections c
    join business_profiles bp on bp.user_id = c.household_id
    join cleaner_profiles cp on cp.user_id = c.cleaner_id
    where bp.id = p_business_id and cp.user_id = auth.uid() and c.status = 'active'
  );
$$;

alter table cleaning_slots enable row level security;

create policy "business manages own slots" on cleaning_slots for all
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()))
  with check (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()));

-- Connected cleaners see the business's slots (weeks ahead) and may
-- reserve open ones or mark their own reservations done.
create policy "connected cleaner reads slots" on cleaning_slots for select
  using (cleaner_connected_to_business(business_id) or is_admin());
create policy "connected cleaner reserves or completes" on cleaning_slots for update
  using (
    cleaner_connected_to_business(business_id)
    and (status = 'open' or reserved_by = (select id from cleaner_profiles where user_id = auth.uid()))
  )
  with check (
    reserved_by = (select id from cleaner_profiles where user_id = auth.uid())
  );

-- Private bucket for optional "done" photos (EXIF stripped client-side).
insert into storage.buckets (id, name, public) values ('turnover-photos', 'turnover-photos', false)
  on conflict (id) do nothing;
create policy "cleaner uploads turnover photo" on storage.objects for insert
  with check (bucket_id = 'turnover-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "business and admin read turnover photos" on storage.objects for select
  using (bucket_id = 'turnover-photos' and (is_admin() or exists (
    select 1 from cleaning_slots s join business_profiles bp on bp.id = s.business_id
    where s.done_photo_path = storage.objects.name and bp.user_id = auth.uid()
  )));
