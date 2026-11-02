-- Site photos managed by the owner from the admin area (Admin → Foto's).
-- Purely additive: nothing is dropped or deleted.
--
-- 1. site_media: one row per photo slot (hero, business pages). Public read,
--    admin write. The file itself lives in the public 'site-media' bucket.
-- 2. admin_allowlist: e-mail addresses that become 'admin' on signup (and
--    are promoted now if the account already exists). Not readable via the
--    API: RLS is on and there are no policies.

-- ========== 1. site_media ==========
create table site_media (
  slot text primary key check (slot in (
    'hero-cleaner',
    'business-airbnb', 'business-hotel', 'business-restaurant', 'business-office', 'business-school'
  )),
  path text not null,                 -- object name inside bucket 'site-media'
  width integer,
  height integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table site_media enable row level security;
create policy "site media is public" on site_media for select using (true);
create policy "admin inserts site media" on site_media for insert with check (is_admin());
create policy "admin updates site media" on site_media for update using (is_admin()) with check (is_admin());
create policy "admin deletes site media" on site_media for delete using (is_admin());

-- Public bucket (anyone may view the marketing photos); only admin writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "site media files are public" on storage.objects for select
  using (bucket_id = 'site-media');
create policy "admin uploads site media" on storage.objects for insert
  with check (bucket_id = 'site-media' and is_admin());
create policy "admin replaces site media" on storage.objects for update
  using (bucket_id = 'site-media' and is_admin());
create policy "admin deletes site media" on storage.objects for delete
  using (bucket_id = 'site-media' and is_admin());

-- ========== 2. admin allow-list ==========
create table admin_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table admin_allowlist enable row level security; -- no policies: API cannot read it

-- The owner's account. Add more rows here (lower-case) if ever needed.
insert into admin_allowlist (email) values ('afrongelic.events@gmail.com')
on conflict do nothing;

create or replace function is_allowlisted_admin(p_user_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    join admin_allowlist a on a.email = lower(u.email)
    where u.id = p_user_id
  );
$$;
revoke execute on function is_allowlisted_admin(uuid) from public, anon, authenticated;

-- The 0004 escalation guard stays, but now also lets an allow-listed
-- account become admin (that is the only way the role is ever granted).
create or replace function prevent_role_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and (old.role is distinct from 'admin')
     and not is_admin() and not is_allowlisted_admin(new.id) then
    raise exception 'role escalation blocked';
  end if;
  return new;
end;
$$;

-- New signups with an allow-listed e-mail start as admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, locale)
  values (
    new.id,
    case
      when exists (select 1 from admin_allowlist a where a.email = lower(new.email)) then 'admin'::user_role
      when new.raw_user_meta_data->>'role' in ('household', 'cleaner', 'business')
        then (new.raw_user_meta_data->>'role')::user_role
      else 'household'
    end,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(new.email, 'gebruiker'), '@', 1)
    ),
    case
      when new.raw_user_meta_data->>'locale' in ('nl', 'en')
        then new.raw_user_meta_data->>'locale'
      else 'nl'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Promote an allow-listed account that already exists.
update profiles p set role = 'admin'
from auth.users u
join admin_allowlist a on a.email = lower(u.email)
where p.id = u.id and p.role <> 'admin';
