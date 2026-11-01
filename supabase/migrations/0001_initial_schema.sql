-- Alieni initial schema (brief §11) — EU-hosted Supabase project.
-- Everything is protected by row-level security; the anon key can only
-- read published cleaner ads and public settings.

-- ========== extensions ==========
create extension if not exists postgis;

-- ========== enums ==========
create type user_role as enum ('household', 'cleaner', 'business', 'admin');
create type profile_status as enum ('draft', 'published', 'hidden', 'removed');
create type meeting_status as enum ('requested', 'accepted', 'rescheduled', 'declined', 'met');
create type connection_status as enum ('pending', 'active', 'ended');
create type report_status as enum ('open', 'resolved_hidden', 'resolved_removed', 'dismissed');

-- ========== profiles (1:1 with auth.users) ==========
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'household',
  display_name text not null check (char_length(display_name) between 1 and 80),
  city text,
  locale text not null default 'nl' check (locale in ('nl', 'en')),
  created_at timestamptz not null default now()
);

-- ========== cleaner ads ==========
create table cleaner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  status profile_status not null default 'draft',
  rate_cents integer not null check (rate_cents >= 1500),
  min_hours numeric(3,1) not null default 2 check (min_hours between 1 and 8),
  services text[] not null default '{}',
  languages text[] not null default '{}',
  postcode text not null check (postcode ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
  radius_km integer not null default 10 check (radius_km between 1 and 100),
  location geography(point, 4326),
  about text check (char_length(about) <= 2000),
  photo_path text, -- private storage bucket path; served via signed URLs
  verified_jobs_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cleaner_profiles_location_idx on cleaner_profiles using gist (location);
create index cleaner_profiles_status_idx on cleaner_profiles (status);

-- weekly availability: 0=Monday … 6=Sunday, block = morning/afternoon/evening
create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  cleaner_profile_id uuid not null references cleaner_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  block text not null check (block in ('morning', 'afternoon', 'evening')),
  unique (cleaner_profile_id, weekday, block)
);

-- ========== favourites ==========
create table favourites (
  user_id uuid not null references profiles (id) on delete cascade,
  cleaner_profile_id uuid not null references cleaner_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cleaner_profile_id)
);

-- ========== reports (DSA) ==========
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles (id) on delete set null,
  subject_type text not null check (subject_type in ('cleaner_profile', 'job', 'message', 'review')),
  subject_id uuid not null,
  reason text not null check (reason in ('scam', 'inappropriate', 'fake', 'offensive', 'other')),
  details text check (char_length(details) <= 1000),
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ========== settings (admin-editable) ==========
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values
  ('rate_floor_cents', '1500'),
  ('household_fee_cents', '1495'),
  ('banned_words', '[]');

-- ========== admin audit log ==========
create table admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references profiles (id),
  action text not null,
  subject text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ========== helper ==========
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ========== row-level security ==========
alter table profiles enable row level security;
alter table cleaner_profiles enable row level security;
alter table availability_slots enable row level security;
alter table favourites enable row level security;
alter table reports enable row level security;
alter table settings enable row level security;
alter table admin_audit_log enable row level security;

-- profiles: owner reads/updates own row; display info of published cleaners is public
create policy "own profile read" on profiles for select using (id = auth.uid() or is_admin());
create policy "public cleaner display" on profiles for select using (
  exists (select 1 from cleaner_profiles cp where cp.user_id = profiles.id and cp.status = 'published')
);
create policy "own profile insert" on profiles for insert with check (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

-- cleaner_profiles: published ads are public; owners manage their own
create policy "published ads are public" on cleaner_profiles for select using (status = 'published' or user_id = auth.uid() or is_admin());
create policy "cleaner creates own ad" on cleaner_profiles for insert with check (user_id = auth.uid());
create policy "cleaner updates own ad" on cleaner_profiles for update using (user_id = auth.uid() or is_admin());

-- availability: follows the ad's visibility
create policy "availability follows ad" on availability_slots for select using (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id
          and (cp.status = 'published' or cp.user_id = auth.uid() or is_admin()))
);
create policy "cleaner manages availability" on availability_slots for all using (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
) with check (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
);

-- favourites: strictly private to the owner
create policy "own favourites" on favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: anyone authenticated can file; only admin reads
create policy "authenticated can report" on reports for insert with check (auth.uid() is not null);
create policy "reporter sees own report status" on reports for select using (reporter_id = auth.uid() or is_admin());
create policy "admin resolves reports" on reports for update using (is_admin());

-- settings: public read (rate floor is shown in the wizard), admin write
create policy "settings are readable" on settings for select using (true);
create policy "admin updates settings" on settings for update using (is_admin());

-- audit log: admin only
create policy "admin reads audit log" on admin_audit_log for select using (is_admin());
create policy "admin writes audit log" on admin_audit_log for insert with check (is_admin());
