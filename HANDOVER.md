# Handover: Agatha's own Alieni (branch `alieni-nl`)

This branch is the slimmed-down version of Alieni. At handover it gets its **own** GitHub repository, its **own**
Supabase project (database), its **own** Vercel project and its own domain. Nothing is shared with the full version.

> **Never run migration 0030 on the current `alieni` database.** `alieni-dev` and `alieni-nl` share that database
> today, and 0030 deletes the tables the full version needs. 0030 is only for Agatha's new, empty database.

Work through the steps in order. Each step says who does it and how to check it worked.

---

## 0. Before you start

- Agatha creates her own accounts (in her name, with her e-mail address and 2-factor login): **GitHub**, **Supabase**,
  **Vercel**, and (if she will send e-mail) **Resend**. She invites you to each one while you set things up.
  That way everything is hers from day one and nothing has to be transferred later.
- Decide which domain she gets, and who it is registered with today (registrar), and in whose name.
- Have a password manager ready: you will create a database password and several keys.
- Nothing in this guide touches your own GitHub repository, Supabase project or Vercel project, except step 5
  (moving the domain) if her domain is attached to your Vercel project today.

---

## 1. GitHub: her own repository

1. Agatha creates an **empty, private** repository in her GitHub account (no README, no licence), e.g. `alieni`.
   She adds you as a collaborator for the setup period.
2. On your computer, copy **only** the `alieni-nl` branch into it. Recommended: start with a fresh history, so her
   repository does not contain the history of the full version:

   ```bash
   git clone --branch alieni-nl --single-branch https://github.com/afrongelicevents-ui/alieni.git agatha-alieni
   cd agatha-alieni
   git checkout --orphan main            # new history, same files
   git commit -m "Alieni (handover)"
   git remote set-url origin https://github.com/<agatha-account>/alieni.git
   git push -u origin main
   git branch -D alieni-nl
   ```

   (To keep the full history instead, skip the `--orphan` and `commit` lines and push with `git push -u origin alieni-nl:main`.)
3. In her repository:
   - Delete `.github/workflows/test-database.yml` (it belongs to your setup and names your database).
   - `backup.yml` is switched off by default. To use it later, follow `docs/BACKUP.md` with *her* database address.
   - Settings → Branches: protect `main` if more people will work on it.

**Check:** her repository shows one branch `main`, the folder `supabase/migrations` has 30 files (`0001` to `0030`).

---

## 2. Supabase: her own database

### 2a. Create the project

1. In Agatha's Supabase account: **New project**. Region: **EU (Frankfurt, `eu-central-1`)**. Plan: Free to start;
   **Pro** before launch (only Pro has automatic daily backups).
2. Choose a strong database password and save it in the password manager.
3. Note the **project ref** (the code in the project URL, e.g. `abcdefghijklmnop`).

### 2b. Run migrations 0001 to 0030

Run them **in order**, on the **new** project only. Easiest with the Supabase command line, from her repository folder:

```bash
npx supabase login                                   # opens the browser; log in as Agatha (or with your invite)
npx supabase link --project-ref <her-project-ref>    # asks for the database password from 2a
npx supabase migration list                          # check: the "Remote" column is empty and the ref is HERS
npx supabase db push                                 # runs 0001 … 0030 in order and records them
```

`db push` lists the 30 files and asks for confirmation. **Before you type "y", read the project ref once more.**

Alternative without the command line: Supabase → SQL Editor → paste each file from `supabase/migrations`, one at a
time, from `0001` to `0030`, and press Run. Do not skip a file and do not change the order.

In a new database 0030 finds nothing to delete. It only removes the empty tables, columns, settings and the two
empty storage buckets (`vog`, `turnover-photos`) that the earlier migrations created.

### 2c. Make Agatha the administrator

Migration `0014` puts **your** e-mail address on the admin allow-list. In her project, replace it with hers
**before anyone signs up** (SQL Editor):

```sql
delete from public.admin_allowlist;
insert into public.admin_allowlist (email) values (lower('<agatha-email>'));
select * from public.admin_allowlist;   -- one row: her address
```

### 2d. Check the database

SQL Editor:

```sql
-- the removed parts are gone
select to_regclass('public.emergency_requests') is null as emergency_gone,
       to_regclass('public.cleaning_slots') is null     as slots_gone,
       to_regclass('public.vog_documents') is null      as vog_gone,
       to_regclass('public.module_interest') is null    as modules_gone;   -- all four: true

-- the services are the three that remain
select service_key, enabled from public.service_catalog order by sort_order;  -- connect, oneoff, contract

-- row security is on for every table (spatial_ref_sys is PostGIS's read-only reference table)
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
   and relname <> 'spatial_ref_sys';                                           -- no rows
```

### 2e. Authentication settings

Supabase → Authentication:

1. **Sign In / Providers → Email: Confirm email ON.** (The admin role is given at sign-up to the address on the
   allow-list, so that address must be verified.)
2. **URL configuration:** Site URL = `https://<her-domain>` (until step 5: the Vercel address from step 3).
   Redirect URLs: add `https://<her-domain>/**` and `https://<her-vercel-project>.vercel.app/**`.
3. **E-mails:** set up custom SMTP (e.g. Resend with her domain), so sign-up and password e-mails come from her
   domain instead of Supabase's test sender (which is limited to a few e-mails per hour).
4. Optional bot protection: **Bot protection → Turnstile**, paste the Turnstile *secret* key here (the *site* key
   goes in Vercel, step 3).

### 2f. Keys for Vercel

Supabase → Project Settings → API: copy the **Project URL**, the **anon / publishable key** and the
**service_role / secret key**. The service key is secret: only in Vercel, never in the code or in a chat.

---

## 3. Vercel: her own project

1. In Agatha's Vercel account: **Add New → Project → Import** her GitHub repository. Framework: Next.js (detected).
   Production branch: `main`.
2. **Environment variables** (Production, and Preview if wanted). Names as in `.env.example`:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | her Project URL (2f) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | her anon key (2f) |
   | `SUPABASE_SERVICE_ROLE_KEY` | her service key (2f) — secret |
   | `CRON_SECRET` | a new long random string (e.g. `openssl rand -hex 32`) |
   | `NEXT_PUBLIC_APP_URL` | `https://<her-domain>` |
   | `COMPANY_NAME`, `COMPANY_KVK`, `COMPANY_BTW`, `CONTACT_EMAIL` | her company details (shown on the legal pages, invoices and footer; leave empty until known) |
   | `RESEND_API_KEY` | her Resend key, once her sending domain is verified |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | optional, Turnstile site key |
   | `NEXT_PUBLIC_LINKEDIN_URL` / `_INSTAGRAM_URL` / `_FACEBOOK_URL` | optional |
   | `MOLLIE_API_KEY`, `PAYMENTS_ACTIVE` | **leave empty** until payments are decided |

   Never copy keys from your own Vercel project: every key must be hers.
3. **Deploy.** The two daily jobs in `vercel.json` (`/api/cron/daily`, `/api/cron/business-billing`) are picked up
   automatically and run once a day (fine on the free Hobby plan).
4. Settings → Deployment Protection: decide whether previews need a Vercel login (production on her own domain is
   always public).

**Check on `https://<her-project>.vercel.app`:**

- The homepage opens without logging in, in Dutch, with the four tiles (Find a cleaner, Become a cleaner,
  For businesses, How it works).
- `/nl/notify/suppliers`, `/nl/emergency` and `/nl/business/calendar` give "page not found".
- Agatha signs up with **her** allow-listed address → confirms the e-mail → she lands in **Admin**.
- Admin → Settings: set the household price, minimum rate and **Business pricing** model, and save.
- Admin → Photos: upload the homepage and business photos (her own database starts without photos; the site uses
  the built-in pictures until then).
- Post a test job as a test business, answer it as a test cleaner, then delete both test accounts again
  (Account → Delete account).

---

## 4. Tests before launch (on your computer, against her code)

From her repository folder:

```bash
npm ci
npm run lint && npx tsc --noEmit && npx vitest run      # code checks and unit tests
npm run test:rls                                       # access rules on a local Postgres with all 30 migrations
```

and the browser flows from `e2e/README.md` (they run against a local stand-in, not against her database).
`test:rls` needs a local PostgreSQL with PostGIS; set `PGHOST`, `PGPORT` and `PGUSER` as described in `e2e/README.md`.

---

## 5. Moving her domain

Do this last, when step 3 checks out. Plan it for a quiet moment; the site can be unreachable for a few minutes.

1. **A day before:** at the registrar (DNS), lower the TTL of the domain's records to 300 seconds, so the change
   spreads quickly.
2. **If the domain is attached to your Vercel project today:** your Vercel project → Settings → Domains → remove
   `<domain>` and `www.<domain>`. (Only those; leave your other domains.)
3. **Her Vercel project** → Settings → Domains → add `<domain>` and `www.<domain>` (choose which one redirects to
   the other). Vercel then shows the DNS records it needs. If the domain was used in another Vercel account,
   it first asks for a TXT record to prove ownership: add it at the registrar.
4. **At the registrar:** set exactly the records Vercel shows (typically an `A` record for the bare domain and a
   `CNAME` for `www`). Remove old records that point elsewhere.
5. Wait until Vercel shows "Valid configuration" and a certificate for both names.
6. Update the places that contain the address:
   - Supabase → Authentication → URL configuration: Site URL `https://<domain>`, redirect `https://<domain>/**`.
   - Vercel env `NEXT_PUBLIC_APP_URL` = `https://<domain>`, then **Redeploy**.
   - Resend: verify `<domain>` as sending domain (it asks for DNS records) and use it in the Supabase SMTP settings.
   - Later, with payments: the Mollie webhook `https://<domain>/api/mollie/webhook`.
7. **If the domain itself must change owner:** do the registrar transfer (unlock + auth code, or an owner change
   within the same registrar) *after* the site works, so the website and the registration are not changing at the
   same time.

**Check:** `https://<domain>` and `https://www.<domain>` open her site with a valid certificate; signing up sends an
e-mail from her domain, and the link in it opens her site.

---

## 6. After the handover

- Agatha removes your access from her GitHub, Supabase, Vercel and Resend accounts, when she is ready.
- Any key you saw during the setup (service key, Resend key, `CRON_SECRET`) is replaced by her with a new one.
- Your own `alieni` database, Vercel project and repository stay exactly as they are. Do **not** run 0030 there.
- Her database starts empty: no users, ads or messages are moved from yours (yours only holds test data).
- Before launch: Supabase **Pro** plan (daily backups) and the launch checklist in `README.md`.

---

## Appendix: what 0030 removes

| Feature | Removed from the database |
|---|---|
| Calendar sync and turnovers | table `cleaning_slots`; `business_units` columns `ical_url`, `ical_last_synced_at`, `ical_last_error`, `checkout_time`, `checkin_time`; storage bucket `turnover-photos`; service `turnover`; jobs "per checkout" |
| Emergency cleaners | tables `emergency_requests`, `cleaner_strikes`; `cleaner_profiles` columns `emergency_opt_in`, `emergency_rate_cents`; settings `emergency_fee_cents`, `cover_rules`; service `cover` |
| Linen & amenities | setting `linen_addon` |
| Coming-soon modules / Notify me | table `module_interest`; setting `website_modules` |
| Schools and VOG | table `vog_documents`; storage bucket `vog`; setting `vog_max_age_months`; business type `school` (blocked by a rule; Postgres cannot delete the label itself) |

Plus the views, triggers, functions and access rules that only served these parts. `docs/0030-data-check.sql`
(read-only) shows how much data 0030 would touch in any database; on her new database everything is 0.
