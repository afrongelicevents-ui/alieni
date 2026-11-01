-- Auto-create a profile row whenever someone signs up via Supabase Auth.
-- The role comes from the signup form's metadata, validated against the
-- enum and never allowed to be 'admin' (defence in depth on top of the
-- 0004 escalation guard).

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, locale)
  values (
    new.id,
    case
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
