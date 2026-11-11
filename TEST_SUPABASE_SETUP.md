# Setting up a separate test Supabase project

> **Current situation:** no separate project exists. By the owner's decision the existing project `alieni` is used as the test database (see DEVELOPMENT_STATUS.md, decisions 3 and 12). This guide is for creating a separate one later.

Use a **separate, empty Supabase project** for testing (a Vercel preview deployment or a local run). Never point a test
build at the live project. Nothing in this guide touches the live project, and nothing here has been run for you.

## 1. Create the test project
1. supabase.com → New project, region **EU (Frankfurt)**, name it e.g. `alieni-test`.
2. Authentication → Sign In / Providers → Email: turn **Confirm email** off for the test project only (so test accounts work without a mailbox).
3. Authentication → URL configuration: Site URL = the preview or local URL; add `<that URL>/**` to the redirect URLs.

## 2. Load the database
Run every file in `supabase/migrations/` **in order** (`0001_…` to `0029_…`) against the test project. Each file is safe to run twice;
a failing file rolls back completely. Pick one way:

**Way A: from a computer (about 5 minutes, recommended).** Copy the connection string (Supabase → Project settings → Database →
Connection string → Session pooler, with your database password filled in) and run in the repository folder:

```bash
export DB_URL='postgresql://...'   # the test project's string, NOT the live one
for f in supabase/migrations/*.sql; do echo "$f"; psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" || break; done
```

**Way C: GitHub Action (recommended from a phone, about 5 minutes after the secrets are added).** The workflow
"Set up TEST database" (`.github/workflows/test-database.yml`) applies all migrations 0001 to 0029 to the test project with the
Supabase CLI, then runs the check query and shows the result in the run summary. It refuses to run for the live project
(by reference and by name: the project's name must contain "test"). Steps:

1. Create the test project (section 1). Name it `alieni-test`. Copy its **Reference ID** (Project settings → General) and the database password you chose.
2. Create a Supabase access token: supabase.com → your avatar → **Account → Access Tokens → Generate new token**.
   The token belongs to your whole account: the workflow only ever uses the test reference, but delete the token again afterwards.
3. GitHub → repository → Settings → Secrets and variables → Actions → **New repository secret**, three times:
   `TEST_SUPABASE_PROJECT_REF` (the Reference ID), `TEST_SUPABASE_DB_PASSWORD` (the database password), `SUPABASE_ACCESS_TOKEN` (the token).
   Optional **Variables** tab: `TEST_ADMIN_EMAIL` (your test address in lower case; it is put on the admin allow-list)
   and `TEST_SITE_URL` (the preview address, starting with https://; it is set as the site address). The workflow also turns
   "Confirm email" off in the test project.
4. Start it: Actions → **Set up TEST database** → **Run workflow**. GitHub only shows that button for workflows on the
   *default* branch. If the workflow is not listed, use the fallback: open the file `test-database/RUN.txt` on the branch
   `alieni-dev`, tap the pencil, add a line, **Commit changes** directly to `alieni-dev`. That starts the same workflow.
5. Open the run. Green means: migrations applied and every check true. The **Summary** shows a table of checks.
   Red: open the failed step; the messages say what to fix (a missing secret, a wrong reference, a refused live project).
6. Delete the access token (step 2). Running the workflow again is safe: applied migrations are skipped.

**Way B: pasting from a phone (30 to 40 minutes, only if Way C is not possible).** Run `python3 scripts/split-migrations.py` (Claude can do this for you). It writes
`test-setup/part-01.sql` to `part-48.sql`, each at most 100 lines. In the test project's SQL Editor paste and run them
one at a time, in order. The last line of every part says `END OF PART n`: if you do not see it, the paste was cut off.
The parts were verified to produce exactly the same database as the migrations.

Check afterwards (should return `t` for every column):

```sql
select
  exists (select 1 from pg_proc where proname = 'submit_job_quote')            as quotes,
  exists (select 1 from pg_proc where proname = 'erase_user_data')             as privacy,
  exists (select 1 from pg_proc where proname = 'answer_meeting_proposal')     as meetings,
  exists (select 1 from pg_proc where proname = 'purge_old_records')           as retention,
  exists (select 1 from pg_policies where tablename = 'cleaner_profiles' and policyname = 'cleaner deletes own ad') as review_fixes,
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
