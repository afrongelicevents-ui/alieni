-- Three separate experiences (brief: cleaner / household / business).
-- Roles are fixed at sign-up and every role-specific write is bound to the
-- role in the database. Purely additive: nothing is dropped or deleted.

-- ========== 1. the role is set once ==========
create or replace function prevent_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not alieni_is_system() then
    raise exception 'role cannot be changed after sign-up';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_prevent_role_change on profiles;
create trigger profiles_prevent_role_change
  before update on profiles
  for each row execute function prevent_role_change();

create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ========== 2. role-bound writes ==========
drop policy if exists "cleaner creates own ad" on cleaner_profiles;
create policy "cleaner creates own ad" on cleaner_profiles for insert
  with check (user_id = auth.uid() and my_role() = 'cleaner');

-- business profile: insert only for business accounts (the FOR ALL policy stays for read/update/delete)
create or replace function guard_business_profile_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not alieni_is_system() and my_role() <> 'business' then
    raise exception 'only business accounts can create a business profile';
  end if;
  return new;
end;
$$;
drop trigger if exists business_profiles_guard_insert on business_profiles;
create trigger business_profiles_guard_insert
  before insert on business_profiles
  for each row execute function guard_business_profile_insert();

drop policy if exists "household creates request" on meeting_requests;
create policy "household creates request" on meeting_requests for insert
  with check (household_id = auth.uid() and my_role() in ('household', 'business'));

drop policy if exists "own favourites" on favourites;
create policy "own favourites read" on favourites for select using (user_id = auth.uid());
create policy "own favourites write" on favourites for insert
  with check (user_id = auth.uid() and my_role() in ('household', 'business'));
create policy "own favourites delete" on favourites for delete using (user_id = auth.uid());

drop policy if exists "household starts conversation" on conversations;
create policy "household starts conversation" on conversations for insert
  with check (household_id = auth.uid() and my_role() in ('household', 'business'));

-- ========== 3. cleaner profile: experience + work scope ==========
alter table cleaner_profiles
  add column if not exists experience_years integer check (experience_years between 0 and 60),
  add column if not exists work_scope text not null default 'household'
    check (work_scope in ('household', 'commercial', 'both'));

-- ========== 4. household profile (search preferences only; no address) ==========
create table if not exists household_profiles (
  user_id uuid primary key references profiles (id) on delete cascade,
  postcode_area text check (postcode_area ~ '^[1-9][0-9]{3}$'),
  needs text[] not null default '{}',
  home_type text check (home_type in ('apartment', 'house', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table household_profiles enable row level security;
create policy "own household profile" on household_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and my_role() = 'household');
create policy "admin reads household profiles" on household_profiles for select using (is_admin());
