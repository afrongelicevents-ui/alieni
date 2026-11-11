-- 0029 — Website redesign content (brief §7/§8)
--  1. public.testimonials: real testimonials added by an admin; public only with consent AND when published
--  2. public.module_interest: "Notify me" sign-ups for modules that aren't live yet (email + consent time)
--  3. settings defaults: website module switches and the homepage video URL
-- Additive only: two new tables and two new settings keys (existing keys are left alone). No existing data is touched.
-- Idempotent: safe to run more than once. Uses public.is_admin() as hardened in 0024.

-- ========== 1. testimonials ==========
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  role text check (role is null or char_length(role) <= 80),
  city text check (city is null or char_length(city) <= 80),
  quote text not null check (char_length(quote) between 1 and 600),
  consent boolean not null default false,
  published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- a testimonial can only be public when the person agreed to it
  constraint testimonials_publish_needs_consent check (not published or consent)
);
alter table public.testimonials enable row level security;

drop policy if exists "published testimonials are public" on public.testimonials;
create policy "published testimonials are public" on public.testimonials
  for select using (published and consent);
drop policy if exists "admin manages testimonials" on public.testimonials;
create policy "admin manages testimonials" on public.testimonials
  for all using (public.is_admin()) with check (public.is_admin());

-- Only the rights the website needs (the rules above decide which rows).
revoke all on public.testimonials from public, anon, authenticated;
grant select on public.testimonials to anon, authenticated;
grant insert, update, delete on public.testimonials to authenticated;

-- ========== 2. module_interest ("Notify me") ==========
create table if not exists public.module_interest (
  id bigint generated always as identity primary key,
  module text not null check (module in ('suppliers', 'equipment', 'careers', 'linen')),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists module_interest_module_email on public.module_interest (module, lower(email));
alter table public.module_interest enable row level security;

-- Anyone may sign up (with consent); only admins can read or delete the list.
drop policy if exists "anyone signs up with consent" on public.module_interest;
create policy "anyone signs up with consent" on public.module_interest
  for insert with check (consent_at is not null and consent_at <= now() + interval '5 minutes');
drop policy if exists "admin reads interest" on public.module_interest;
create policy "admin reads interest" on public.module_interest for select using (public.is_admin());
drop policy if exists "admin deletes interest" on public.module_interest;
create policy "admin deletes interest" on public.module_interest for delete using (public.is_admin());

revoke all on public.module_interest from public, anon, authenticated;
-- select is granted so reads return "no rows" instead of an error; the rule above shows rows to admins only.
grant select on public.module_interest to anon, authenticated;
grant insert (module, email, consent_at) on public.module_interest to anon, authenticated;
grant delete on public.module_interest to authenticated;

-- ========== 3. settings defaults (new keys only) ==========
insert into public.settings (key, value) values
  ('website_modules', '{"suppliers": {"live": false, "url": ""}, "equipment": {"live": false, "url": ""}, "careers": {"live": false, "url": "/jobs"}, "linen": {"live": false, "url": ""}}'),
  ('homepage_video_url', '""')
on conflict (key) do nothing;
