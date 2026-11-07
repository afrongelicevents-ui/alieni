# Morning report

## 1. Preview and latest commit
- **Branch:** `alieni-dev` (never `main`, never `claude/new-session-iodsy8`). Only a preview deployment is created.
- **Latest commit:** the top of branch `alieni-dev` on GitHub. The last code commit is `b241c7b`; the final commit after it only fills in the numbers of this report.
- **Vercel build:** succeeded for the latest pushed commits (so the production build works).
- **Preview address:** the sandbox cannot open `vercel.app`, so I could not read the exact address. Open it in Vercel → project `alieni` → Deployments → the top `alieni-dev` entry → Visit. The deployment page for the last build is
  https://vercel.com/afrongelicevents-ui/alieni/HoLhFP9J4xhqCb9YLDYm3QRruwzk (the preview address is on it). Vercel's stable branch address normally looks like `alieni-git-alieni-dev-<team>.vercel.app`.
- **Warning:** the preview still uses the live Supabase project. Do not sign up, post or send anything on it until step 4 is done.

## 2. What is finished and what is open
**Finished tonight**
- All checks re-run: types, lint, 135 unit tests, translations, real Postgres fresh (283 of 283) and upgrade (453 of 453), browser flows 1-13 (503 checks), crawl (150 pages, 0 problems).
- Security review (read-only, then verified on a real Postgres). Two real weaknesses found and fixed in migration **0028**, plus one broken feature:
  1. an admin-hidden ad could be undone by deleting and re-creating it;
  2. a removed job could be put back online by its owner;
  3. distance search had stopped working after the exact location was hidden; it now works again and measures to a point on a ~1 km grid, so a home address cannot be found by repeated searches.
  Without 0028 three new tests fail, with it they pass.
- Reports on chat messages (only the reported message is shared with the admin).
- Disaster recovery: `docs/` (index, architecture, decisions, `REBUILD.md`, `BACKUP.md`, the planning brief), complete `.env.example`, weekly backup workflow written and **switched off**; the dump, encrypt, decrypt and restore steps were rehearsed on a scratch database.
- Polish: empty states in the admin tables, footer logo, text check (no untranslated or hard-coded text found), 150-page crawl without broken links, phone and desktop screenshots reviewed.
- Test-project setup guide (`TEST_SUPABASE_SETUP.md`) and a splitter (`scripts/split-migrations.py`) that cuts the 28 migrations into 48 phone-sized parts (verified to give an identical database).

**Still open**
- Nothing is on the live database: migrations 0024 to 0028 still have to be applied there (only after you approve, and after the test project has been checked).
- The test Supabase project does not exist yet (step 4).
- Business payment method and month-end billing: not built on purpose (payments stay off).
- Admin jobs list, manual calendar-sync button, business payments overview, dispute routing, "met" status: not built (see `DEVELOPMENT_STATUS.md`).
- Not verifiable here: live Supabase settings, e-mail delivery, domain, load, backup restore on a real project.

## 3. DECISIONS FOR ME
See the end of `DEVELOPMENT_STATUS.md` (8 items). The ones that matter most:
1. `main` and production branch: GitHub still shows `claude/new-session-iodsy8` as the default and no `main`. Please check GitHub and Vercel (Production Branch) before anything else is pushed.
2. The repository is public: make it private (the backup workflow refuses to run while it is public).
3. The preview must get its own test database before anyone tests with it.
4. Add the original brief to `docs/briefs/`.

## 4. (Superseded) Your morning task
> The test database was set up automatically on the existing project `alieni`; see `DEVELOPMENT_STATUS.md`. The steps below are only needed to create a separate project later.

Goal: a separate test database that the preview can use. Do these in order. Never use the keys of the live project here.

1. supabase.com → sign in → **New project**. Name: `alieni-test`. Region: **EU (Frankfurt)**. Set a database password and save it in your password manager. Tap **Create** and wait about 2 minutes.
2. In the new project: **Authentication → Sign In / Providers → Email** → turn **Confirm email** OFF → Save. (Test project only.)
3. **Project settings → API**: copy three things into a private note: *Project URL*, *anon public key*, *service_role key* (tap Reveal). Check the name at the top says `alieni-test`.
4. Vercel → project `alieni` → **Settings → Environment Variables**. First look at the existing Supabase variables: if one is ticked for **Preview**, untick Preview there (they are the live keys). Then add these three, ticking **only Preview** and choosing branch `alieni-dev`:
   - `NEXT_PUBLIC_SUPABASE_URL` = the test Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the test anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = the test service_role key
5. Vercel → **Deployments** → the top `alieni-dev` entry → ⋯ → **Redeploy** (new variables only apply to new builds).
6. In the test project: **Authentication → URL configuration**: Site URL = the preview address; add `<preview address>/**` to Redirect URLs.
7. Before you sign up: test project → **SQL Editor** → run (use your own address in lower case):
   `insert into public.admin_allowlist (email) values ('your-address@example.com') on conflict do nothing;`
   (This works only after the database is loaded, step 8.)
8. **Load the database**: use the GitHub Action "Set up TEST database" (about 5 minutes once its three secrets exist). Steps are in
   `TEST_SUPABASE_SETUP.md` → "Way C". (Pasting 48 parts by hand is the last-resort fallback, "Way B".)
   Afterwards the run summary must show every check as ✅.

## 5. Click-through test list (do this on the preview AFTER step 8)
Use new test e-mail addresses (for example `test+household@yourdomain`). Tick what works, note what looks wrong.

**All roles**
- [ ] Switch NL/EN in the footer; the page stays on the same screen.
- [ ] On a phone: the bottom menu fits, nothing sticks out sideways.
- [ ] Nowhere does a price in euros appear for Alieni itself ("nothing is charged at the moment" is expected).

**Household**
- [ ] Sign up as household. You land on Home; the menu shows Home, Find, Messages, Favourites, Account.
- [ ] Search with a postcode; open a cleaner's ad (no full address shown, only the area).
- [ ] Tap the heart (favourite), then check Favourites.
- [ ] Request a meeting: the note says no payment details are needed now.
- [ ] Open the chat; type a phone number: it must be masked until both sides confirm a deal.
- [ ] Tap "Report message" on the cleaner's message and send the report.
- [ ] Both sides tap "We have a deal": contact details appear.
- [ ] Leave a review for the cleaner.
- [ ] Emergency: post an emergency request; after a cleaner accepts you can message and cancel.
- [ ] Account: "Download my data" works; "Delete my account" (do this last, on a test account).

**Cleaner**
- [ ] Sign up as cleaner; fill the profile wizard (about you, photo, services, rate, VOG, at least one available time) and publish: "Your ad is live".
- [ ] Home shows a checklist; Messages shows the household's request.
- [ ] Accept a meeting; try "Propose another time" on another one; the household answers.
- [ ] Jobs: browse jobs, send a quotation on a business job; check "My quotations".
- [ ] Work: reserve a turnover, release it again; turn on emergency cover and accept an emergency request.
- [ ] Report a job.

**Business**
- [ ] Sign up as business (company details); the dashboard shows your services and "No charges recorded".
- [ ] Post a one-off job and a regular job with days and times.
- [ ] See a quotation arrive in Requests; Accept one, Decline another; the job shows its visits.
- [ ] Cancel an awarded job.
- [ ] Add a manual turnover on the calendar (or an iCal link) if your business type has turnovers.
- [ ] Edit company details and locations; post an emergency / cover request.
- [ ] Work done lists finished work; no invoices or payment demands appear.

**Admin** (the address you put on the allow-list)
- [ ] Log in; you are taken to `/admin`; the normal household and cleaner pages are not open to you.
- [ ] Reports: open the message report from the household test: it shows only that message. Try Hide, Dismiss and re-open.
- [ ] Ads: hide an ad, then check the cleaner cannot make it public again or delete it; restore it as admin.
- [ ] Users: suspend and restore a test user.
- [ ] VOG queue: approve or reject an upload.
- [ ] Settings: prices stay at 0,00; set a banned word and see it refused in chat; Services and Pricing rules open; the empty tables show "Nothing to show yet".
