-- Alieni phase 3: meeting requests, conversations, chat, connections, reviews.

create type meeting_type as enum ('in_person', 'video');

-- ========== meeting requests ==========
create table meeting_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references profiles (id) on delete cascade,
  cleaner_profile_id uuid not null references cleaner_profiles (id) on delete cascade,
  type meeting_type not null,
  status meeting_status not null default 'requested',
  proposed_weekday smallint not null check (proposed_weekday between 0 and 6),
  proposed_block text not null check (proposed_block in ('morning', 'afternoon', 'evening')),
  message text check (char_length(message) <= 500),
  -- Mollie €0 mandate is created when the request is placed (brief §3.4);
  -- stored on the household, used only after a mutual deal.
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index meeting_requests_cleaner_idx on meeting_requests (cleaner_profile_id, status);

-- ========== conversations & messages ==========
create table conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references profiles (id) on delete cascade,
  cleaner_id uuid not null references profiles (id) on delete cascade,
  meeting_request_id uuid references meeting_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (household_id, cleaner_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  body text not null check (char_length(body) between 1 and 4000),
  -- true while contacts are masked (no active connection between the two
  -- parties at send time). The masking itself runs server-side on insert.
  masked boolean not null default true,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

-- ========== connections (the paid relationship) ==========
create table connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references profiles (id),
  cleaner_id uuid not null references profiles (id),
  status connection_status not null default 'pending',
  household_confirmed_at timestamptz,
  cleaner_confirmed_at timestamptz,
  mollie_customer_id text,
  mollie_subscription_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, cleaner_id)
);

-- ========== reviews (only for confirmed connections, brief §5) ==========
create table reviews (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  author_id uuid not null references profiles (id),
  subject_id uuid not null references profiles (id),
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  unique (connection_id, author_id)
);

-- ========== helpers ==========
create or replace function is_conversation_member(conv_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = conv_id and (c.household_id = auth.uid() or c.cleaner_id = auth.uid())
  );
$$;

create or replace function has_active_connection(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from connections
    where status = 'active'
      and ((household_id = a and cleaner_id = b) or (household_id = b and cleaner_id = a))
  );
$$;

-- Server-side guarantee for the masked flag: a sender cannot claim an
-- unmasked message unless an active connection exists between the parties.
create or replace function enforce_message_masking() returns trigger
language plpgsql security definer set search_path = public as $$
declare conv conversations;
begin
  select * into conv from conversations where id = new.conversation_id;
  if not has_active_connection(conv.household_id, conv.cleaner_id) then
    new.masked := true;
  end if;
  return new;
end;
$$;

create trigger messages_enforce_masking
  before insert on messages
  for each row execute function enforce_message_masking();

-- ========== row-level security ==========
alter table meeting_requests enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table connections enable row level security;
alter table reviews enable row level security;

-- meeting requests: the two parties only
create policy "household creates request" on meeting_requests for insert
  with check (household_id = auth.uid());
create policy "parties read request" on meeting_requests for select using (
  household_id = auth.uid()
  or exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
  or is_admin()
);
create policy "cleaner responds" on meeting_requests for update using (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
  or household_id = auth.uid()
);

-- conversations: members only
create policy "members read conversation" on conversations for select
  using (household_id = auth.uid() or cleaner_id = auth.uid() or is_admin());
create policy "household starts conversation" on conversations for insert
  with check (household_id = auth.uid());

-- messages: members only; sender must be the authenticated user
create policy "members read messages" on messages for select
  using (is_conversation_member(conversation_id) or is_admin());
create policy "members send messages" on messages for insert
  with check (sender_id = auth.uid() and is_conversation_member(conversation_id));

-- connections: the two parties only
create policy "parties read connection" on connections for select
  using (household_id = auth.uid() or cleaner_id = auth.uid() or is_admin());
create policy "parties update connection" on connections for update
  using (household_id = auth.uid() or cleaner_id = auth.uid());
create policy "household creates connection" on connections for insert
  with check (household_id = auth.uid());

-- reviews: only parties of an ACTIVE/ended confirmed connection may write,
-- one review per author per connection; everyone may read (public proof)
create policy "reviews are public" on reviews for select using (true);
create policy "party reviews confirmed connection" on reviews for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from connections c
    where c.id = connection_id
      and c.household_confirmed_at is not null
      and c.cleaner_confirmed_at is not null
      and (c.household_id = auth.uid() or c.cleaner_id = auth.uid())
      and (c.household_id = subject_id or c.cleaner_id = subject_id)
      and subject_id <> auth.uid()
  )
);
