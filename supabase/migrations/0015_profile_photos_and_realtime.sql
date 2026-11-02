-- Household/cleaner go-live: profile photos + helpers.
-- Purely additive: nothing is dropped or deleted.

-- ========== 1. profile photos (public bucket: the photo is part of a public ad) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "profile photos are public" on storage.objects for select
  using (bucket_id = 'profile-photos');
create policy "user uploads own profile photo" on storage.objects for insert
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user replaces own profile photo" on storage.objects for update
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user deletes own profile photo" on storage.objects for delete
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== 2. a cleaner may also take their ad offline (delete) ==========
create policy "cleaner deletes own ad" on cleaner_profiles for delete using (user_id = auth.uid());

-- ========== 3. meeting requests: the cleaner's conversation row ==========
-- The household starts the conversation (policy exists); the cleaner needs
-- to be able to update last_message_at too (either member).
create policy "members update conversation" on conversations for update
  using (household_id = auth.uid() or cleaner_id = auth.uid());

-- ========== 4. connections: cleaner may also open one (both confirm anyway) ==========
create policy "cleaner creates connection" on connections for insert
  with check (cleaner_id = auth.uid());

-- ========== 5. activate a connection once both parties confirmed ==========
create or replace function activate_connection_when_both_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and new.status = 'pending' then
    new.status := 'active';
    new.started_at := coalesce(new.started_at, now());
    -- trust metric for the cleaner (brief §5): one more confirmed job
    update cleaner_profiles set verified_jobs_count = verified_jobs_count + 1
      where user_id = new.cleaner_id;
  end if;
  return new;
end;
$$;
drop trigger if exists connections_activate on connections;
create trigger connections_activate
  before update on connections
  for each row execute function activate_connection_when_both_confirm();

-- The verified_jobs_count guard (0004) blocks non-admin changes; the trigger
-- above runs as the function owner, so allow it explicitly.
create or replace function prevent_verified_count_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified_jobs_count is distinct from old.verified_jobs_count
     and not is_admin()
     and current_setting('alieni.system', true) is distinct from 'on' then
    new.verified_jobs_count := old.verified_jobs_count;
  end if;
  return new;
end;
$$;
create or replace function activate_connection_when_both_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and new.status = 'pending' then
    new.status := 'active';
    new.started_at := coalesce(new.started_at, now());
    perform set_config('alieni.system', 'on', true);
    update cleaner_profiles set verified_jobs_count = verified_jobs_count + 1
      where user_id = new.cleaner_id;
    perform set_config('alieni.system', 'off', true);
  end if;
  return new;
end;
$$;

-- ========== 6. realtime for chat ==========
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages;
  end if;
exception when duplicate_object then null;
end $$;

-- ========== 7. conversation members may see each other's display name ==========
create policy "conversation members see each other" on profiles for select using (
  exists (
    select 1 from conversations c
    where (c.household_id = profiles.id and c.cleaner_id = auth.uid())
       or (c.cleaner_id = profiles.id and c.household_id = auth.uid())
  )
);

-- ========== 8. messages: sender may delete own message within 5 minutes (typo fix) ==========
create policy "sender deletes own recent message" on messages for delete
  using (sender_id = auth.uid() and created_at > now() - interval '5 minutes');
