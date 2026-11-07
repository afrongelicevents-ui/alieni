# Rebuild Alieni from scratch (new accounts)

Use this if the GitHub, Vercel or Supabase accounts are lost or need to move. Everything needed is in the repository
except the secrets (keys) and the data (see `BACKUP.md`). Allow about 2 hours without data, plus restore time with data.

## 0. What you need
- A GitHub account (the code), a Vercel account (hosting), a Supabase account (database), a Resend account (e-mail).
- Mollie is **not** needed: payments are off.
- A domain name (optional; Vercel gives a free `*.vercel.app` address).

## 1. Code
1. Create a new empty GitHub repository (private recommended).
2. From any copy of the code (a laptop clone, or a downloaded zip of the old repository):
   `git remote add new <new-repo-url>` then `git push new <branch>:main`.
   If there is no copy, download the latest backup bundle (see `BACKUP.md`).

## 2. Database (Supabase)
1. supabase.com → New project, region **EU (Frankfurt)**. Save the database password in a password manager.
2. Authentication → Sign In / Providers → Email: **Confirm email ON** for a real site.
3. Authentication → URL configuration: Site URL = the new site URL; add `<site URL>/**` to redirect URLs.
4. SQL Editor: run every file in `supabase/migrations/` in order, `0001_…` to `0028_…`, one file at a time.
   Paste long files in parts at a blank line. Each file is safe to run twice.
5. Check (every column must show `t`):
   ```sql
   select
     exists (select 1 from pg_proc where proname = 'submit_job_quote')        as quotes,
     exists (select 1 from pg_proc where proname = 'erase_user_data')         as privacy,
     exists (select 1 from pg_proc where proname = 'answer_meeting_proposal') as meetings,
     exists (select 1 from pg_proc where proname = 'purge_old_records')       as retention;
   ```
6. Add the owner as admin **before** signing up: 
   `insert into public.admin_allowlist (email) values ('owner-address@example.com') on conflict do nothing;`
   (the address must be lower-case).
7. Storage buckets are created by the migrations (photos, VOG documents, site media). Check Storage shows them.
8. Authentication → Bot protection: paste the Cloudflare Turnstile **secret** key (optional).

## 3. Hosting (Vercel)
1. Add New Project → import the new repository. Framework: Next.js (automatic).
2. **Production Branch = `main`.** Work branches only get preview deployments.
3. Settings → Environment Variables (see the list below). Use **Production** values only for the live site.
   Previews must use a **separate test Supabase project**.
4. Deploy. `vercel.json` registers the two daily crons automatically (Hobby plan allows two).

## 4. Environment variables
| Name | Where from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | public (protected by the access rules) |
| `SUPABASE_SERVICE_ROLE_KEY` | same | **secret**, server only; needed for e-mails, crons, account deletion/export |
| `CRON_SECRET` | make up a long random string | protects the cron endpoints |
| `RESEND_API_KEY` | Resend → API keys | verify the sending domain in Resend first |
| `NEXT_PUBLIC_APP_URL` | your site URL | optional |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile | optional |
| `COMPANY_NAME`, `COMPANY_KVK`, `COMPANY_BTW`, `CONTACT_EMAIL` | the operating company | shown on the legal pages; leave empty until known |
| `MOLLIE_API_KEY`, `PAYMENTS_ACTIVE` | — | **leave empty**: nothing can be charged |
| `MOLLIE_WEBHOOK_SECRET` | — | listed in `.env.example` but not read by the code today |

## 5. Restore data (optional)
Follow `BACKUP.md` → "Restore". Do it on the **new** project after step 2 and before opening the site.

## 6. Check it works
1. Open the site; sign up as the admin address; open `/admin`.
2. Sign up a test household and cleaner (use a test project, not the live one, for experiments).
3. Run `npm ci && npm run typecheck && npm test` on a laptop. `npm run test:rls` needs a local Postgres (see `e2e/README.md`).
