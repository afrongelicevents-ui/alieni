-- 0024 — Website redesign content (brief §7/§8)
--  * testimonials: real testimonials added by an admin, shown only with consent and when published
--  * module_interest: "Notify me" sign-ups for modules that aren't live yet (email + consent)
--  * settings defaults: website module switches and the homepage video URL
-- Idempotent: safe to run more than once.

-- ========== testimonials ==========
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  role text check (role is null or char_length(role) <= 80),
  city text check (city is null or char_length(city) <= 80),
  quote text not null check (char_length(quote) between 1 and 600),
  consent boolean not null default false,
  published boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- a testimonial can only be public when the person agreed to it
  constraint testimonials_publish_needs_consent check (not published or consent)
);
alter table testimonials enable row level security;

drop policy if exists "published testimonials are public" on testimonials;
create policy "published testimonials are public" on testimonials
  for select using (published and consent);
drop policy if exists "admin manages testimonials" on testimonials;
create policy "admin manages testimonials" on testimonials
  for all using (is_admin()) with check (is_admin());

grant select on testimonials to anon, authenticated;
grant insert, update, delete on testimonials to authenticated;

-- ========== module_interest ("Notify me") ==========
create table if not exists module_interest (
  id bigint generated always as identity primary key,
  module text not null check (module in ('suppliers', 'equipment', 'careers', 'linen')),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists module_interest_module_email on module_interest (module, lower(email));
alter table module_interest enable row level security;

-- Anyone may sign up (with consent); only admins can read or delete the list.
drop policy if exists "anyone signs up with consent" on module_interest;
create policy "anyone signs up with consent" on module_interest
  for insert with check (consent_at is not null and consent_at <= now() + interval '5 minutes');
drop policy if exists "admin reads interest" on module_interest;
create policy "admin reads interest" on module_interest for select using (is_admin());
drop policy if exists "admin deletes interest" on module_interest;
create policy "admin deletes interest" on module_interest for delete using (is_admin());

grant insert on module_interest to anon, authenticated;
grant select, delete on module_interest to authenticated;

-- ========== settings defaults ==========
insert into settings (key, value) values
  ('website_modules', '{"suppliers": {"live": false, "url": ""}, "equipment": {"live": false, "url": ""}, "careers": {"live": false, "url": "/jobs"}, "linen": {"live": false, "url": ""}}'),
  ('homepage_video_url', '""')
on conflict (key) do nothing;
