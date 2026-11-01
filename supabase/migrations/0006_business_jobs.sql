-- Alieni phase 5: business accounts, job posts (€9.95 excl. btw per post),
-- cleaner responses. Data minimisation: a job carries a postcode AREA only,
-- never a street address — the exact location is shared between the parties
-- themselves after contact.

create type job_status as enum ('draft', 'pending_payment', 'published', 'filled', 'expired', 'removed');
create type space_type as enum ('office', 'shop', 'airbnb', 'hospitality', 'other');

-- ========== business profiles ==========
create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  company_name text not null check (char_length(company_name) between 1 and 120),
  -- Plain text by design: NOT verified (brief §4); users check each other.
  kvk_number text check (kvk_number ~ '^[0-9]{8}$'),
  btw_number text,
  created_at timestamptz not null default now()
);

-- ========== jobs ==========
create table jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete cascade,
  status job_status not null default 'draft',
  space_type space_type not null,
  size_m2 integer check (size_m2 between 1 and 100000),
  postcode text not null check (postcode ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
  frequency text not null check (frequency in ('once', 'weekly', 'biweekly', 'monthly')),
  schedule_note text check (char_length(schedule_note) <= 300),
  description text not null check (char_length(description) between 10 and 2000),
  budget_cents integer not null check (budget_cents >= 1500), -- per hour, >= rate floor
  -- €9.95 excl. btw per post (decision 2026-11-01); paid via Mollie before publish
  post_payment_id uuid references payments (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz
);
create index jobs_status_idx on jobs (status, published_at desc);

-- ========== responses ==========
create table job_responses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  cleaner_profile_id uuid not null references cleaner_profiles (id) on delete cascade,
  rate_cents integer not null check (rate_cents >= 1500),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (job_id, cleaner_profile_id)
);

-- ========== settings ==========
insert into settings (key, value) values
  ('business_pricing', '{"model": "per_job", "price_excl_btw_cents": 995}');

-- ========== row-level security ==========
alter table business_profiles enable row level security;
alter table jobs enable row level security;
alter table job_responses enable row level security;

-- business profile: owner manages; company display info public with published jobs
create policy "own business profile" on business_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "public business display" on business_profiles for select using (
  exists (select 1 from jobs j where j.business_id = business_profiles.id and j.status = 'published')
  or is_admin()
);

-- jobs: published are public; business manages own (publishing requires payment,
-- enforced server-side when the Mollie webhook confirms the post fee)
create policy "published jobs are public" on jobs for select using (
  status = 'published'
  or exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid())
  or is_admin()
);
create policy "business creates job" on jobs for insert with check (
  exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid())
);
create policy "business updates own job" on jobs for update using (
  exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid())
  or is_admin()
);

-- responses: cleaner writes own; visible to that cleaner and the job's business
create policy "cleaner responds" on job_responses for insert with check (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
);
create policy "parties read responses" on job_responses for select using (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
  or exists (
    select 1 from jobs j join business_profiles bp on bp.id = j.business_id
    where j.id = job_id and bp.user_id = auth.uid()
  )
  or is_admin()
);
