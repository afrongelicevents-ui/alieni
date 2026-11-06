# Setting up a separate test Supabase project

Use a **separate, empty Supabase project** for testing (a Vercel preview deployment or a local run). Never point a test
build at the live project. Nothing in this guide touches the live project, and nothing here has been run for you.

## 1. Create the test project
1. supabase.com → New project, region **EU (Frankfurt)**, name it e.g. `alieni-test`.
2. Authentication → Sign In / Providers → Email: turn **Confirm email** off for the test project only (so test accounts work without a mailbox).
3. Authentication → URL configuration: Site URL = the preview or local URL; add `<that URL>/**` to the redirect URLs.

## 2. Load the database
In the test project's SQL Editor run the files in `supabase/migrations/` **in order, one file at a time**,
`0001_…` up to `0027_…` (each file is safe to run twice; a failing file rolls back completely).
Paste long files in parts if the editor refuses them (split at a blank line between statements).

Check afterwards (should return `t` for every column):

```sql
select
  exists (select 1 from pg_proc where proname = 'submit_job_quote')            as quotes,
  exists (select 1 from pg_proc where proname = 'erase_user_data')             as privacy,
  exists (select 1 from pg_proc where proname = 'answer_meeting_proposal')     as meetings,
  exists (select 1 from pg_proc where proname = 'purge_old_records')           as retention,
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef and p.proconfig is null) as search_path_fixed;
```

## 3. Connect the app
Set these in the **Preview** environment of Vercel (or `.env.local` for a local run), using the test project's keys:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | test project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | test project anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | test project service role key (server only; never in the browser) |
| `MOLLIE_API_KEY`, `PAYMENTS_ACTIVE` | **leave unset**: nothing can be charged |

Do not copy the live project's keys into the Preview environment.

## 4. Make yourself admin in the test project
An account becomes admin at sign-up when its e-mail is on the allow-list (`admin_allowlist`). In the test project's SQL Editor,
**before** you sign up (use a lower-case address):

```sql
insert into public.admin_allowlist (email) values ('your-test-address@example.com') on conflict do nothing;
```

Then sign up in the test app with that address.

## 5. Try it
Sign up one household, one cleaner and one business account (use different e-mail addresses) and walk through
`e2e/README.md`'s flows by hand: publish an ad, request a meeting, post a job, send a quotation, report a message.

## What the automatic checks cover
`npm run test:rls` (real Postgres, all migrations, both fresh and upgrade) checks the access rules.
The browser flows in `e2e/` run against a local stand-in, not against Supabase.
