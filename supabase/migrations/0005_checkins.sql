-- Alieni automations (brief §3.10): track the one-time "did you find a
-- match?" check-in for conversations that went silent.

alter table conversations
  add column checkin_sent_at timestamptz;

-- Candidates: lively conversations (6+ messages) with no activity for a
-- week, no connection between the parties, and no check-in sent yet.
create or replace function checkin_candidates()
returns table (conversation_id uuid, household_id uuid, cleaner_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.household_id, c.cleaner_id
  from conversations c
  where c.checkin_sent_at is null
    and c.last_message_at < now() - interval '7 days'
    and (select count(*) from messages m where m.conversation_id = c.id) >= 6
    and not exists (
      select 1 from connections x
      where (x.household_id = c.household_id and x.cleaner_id = c.cleaner_id)
    );
$$;
