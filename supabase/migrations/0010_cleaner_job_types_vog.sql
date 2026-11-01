-- Business v2 (M3): cleaner job types, KvK for business work, VOG for
-- schools (admin-approved, private, file deleted after review), emergency
-- opt-in. Purely additive.

create type vog_status as enum ('pending', 'approved', 'rejected');

alter table cleaner_profiles
  add column job_types text[] not null default '{household}',
  add column kvk_number text check (kvk_number is null or kvk_number ~ '^[0-9]{8}$'),
  add column emergency_opt_in boolean not null default false,
  add column emergency_rate_cents integer check (emergency_rate_cents is null or emergency_rate_cents >= 1500);

-- Business job types require a KvK number (cleaners work self-employed).
alter table cleaner_profiles add constraint cleaner_business_needs_kvk check (
  not (job_types && array['airbnb','hotel','restaurant','office','school']) or kvk_number is not null
);

-- ========== VOG documents ==========
create table vog_documents (
  id uuid primary key default gen_random_uuid(),
  cleaner_profile_id uuid not null unique references cleaner_profiles (id) on delete cascade,
  storage_path text, -- private bucket 'vog'; NULL after review (file deleted)
  issued_at date not null,
  status vog_status not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table vog_documents enable row level security;
-- cleaner sees only own status (never other cleaners'); admin manages all
create policy "cleaner manages own vog" on vog_documents for all
  using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()))
  with check (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid()));
create policy "admin reviews vog" on vog_documents for all using (is_admin()) with check (is_admin());

-- Private storage bucket: cleaners upload their own file; only admin reads.
insert into storage.buckets (id, name, public) values ('vog', 'vog', false)
  on conflict (id) do nothing;
create policy "cleaner uploads own vog" on storage.objects for insert
  with check (bucket_id = 'vog' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admin reads vog files" on storage.objects for select
  using (bucket_id = 'vog' and is_admin());
create policy "admin deletes vog files" on storage.objects for delete
  using (bucket_id = 'vog' and is_admin());

-- Data minimisation: once reviewed, the file is deleted; only the outcome
-- and issue date remain.
create or replace function delete_vog_file_after_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' and old.status = 'pending' then
    if new.storage_path is not null then
      delete from storage.objects where bucket_id = 'vog' and name = new.storage_path;
    end if;
    new.storage_path := null;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger vog_delete_file_after_review
  before update on vog_documents
  for each row execute function delete_vog_file_after_review();

-- School searches only show cleaners with an approved VOG that is not
-- older than the admin max age (settings.vog_max_age_months).
create or replace function vog_is_valid(p_cleaner_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vog_documents v
    where v.cleaner_profile_id = p_cleaner_profile_id
      and v.status = 'approved'
      and v.issued_at >= (current_date - make_interval(months =>
        coalesce((select (value #>> '{}')::int from settings where key = 'vog_max_age_months'), 12)))
  );
$$;

-- Public read of VOG badge state only (boolean), never the document.
create or replace view cleaner_vog_badges as
  select cp.id as cleaner_profile_id, vog_is_valid(cp.id) as vog_valid
  from cleaner_profiles cp where cp.status = 'published';
