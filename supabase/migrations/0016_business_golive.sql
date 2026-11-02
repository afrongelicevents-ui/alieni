-- Business side go-live. Purely additive: nothing is dropped or deleted.

-- jobs: the board shows a city; it was only derived from the unit before.
alter table jobs add column if not exists city text;

-- Job responses: the business may also delete its own job (take it down).
create policy "business deletes own job" on jobs for delete using (
  exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid())
);

-- Cleaner may withdraw a response.
create policy "cleaner withdraws response" on job_responses for delete using (
  exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.user_id = auth.uid())
);

-- The business can see the display name + photo of cleaners who responded
-- (they are published cleaners, so the ad is public already) — nothing new
-- needed. The cleaner can see the company name of a published job via the
-- "public business display" policy.

-- Emergency: the requester must be able to cancel (update own) — covered by
-- "requester manages own request" (for all). Opted-in cleaners read open
-- requests through the view; grant it explicitly.
grant select on emergency_requests_open to authenticated;

-- Accepting cleaner may read the requester's display name for the job card.
create policy "emergency parties see each other" on profiles for select using (
  exists (
    select 1 from emergency_requests er
    join cleaner_profiles cp on cp.id = er.accepted_by
    where (er.requester_id = profiles.id and cp.user_id = auth.uid())
       or (cp.user_id = profiles.id and er.requester_id = auth.uid())
  )
);
