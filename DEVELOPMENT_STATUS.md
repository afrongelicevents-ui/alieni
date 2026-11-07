# Alieni: development status

State of the repository at the end of the development phase. Nothing here has been committed, pushed, deployed or run on
the live database; the new database parts (14, 15, 16, 17, 18) are files in `supabase/migrations/` that still have to be applied.

## What was built or completed in this phase

| Area | Result |
|---|---|
| Quotations, one-off cleaning, regular schedules (Part 15) | A job carries its schedule; a cleaner sends a quotation (`submit_job_quote`); the business accepts or declines (two-step accept), the job is awarded, work is scheduled, a fee event is recorded at the active rule (EUR 0 today); a regular job generates its visits four weeks ahead (daily cron); either side can cancel an awarded job. Business "Requests" lists every job with its quotations and visits; the cleaner "My jobs" tab shows their quotations. |
| Database hardening (Part 16) | Read-only helper views, VOG self-approval closed, emergency requests cannot be forged or moved, moderation sticks, conversation members fixed, trust counter counted once, cleaner's full postcode/exact location/KvK no longer public, connected cleaners see unit name and address, inactive pricing rules not public, turnover slots can be released or cancelled, erasure function, signed-in-only functions. |
| Private company data (Part 14) | `business_public` view; verified again together with Parts 15 and 16 (see tests). |
| Privacy rights | "Download my data" and "Delete my account" on the Account page; legal pages no longer show placeholders (company details come from `COMPANY_NAME`, `COMPANY_KVK`, `COMPANY_BTW`, `CONTACT_EMAIL`). |
| Reviews | Household or business reviews a cleaner after a confirmed deal; rating and reviews shown on the ad; no author name. |
| Notifications | Awaited (no lost mails), quotation received/accepted/declined, job cancelled, meeting answered, turnover reserved/completed, VOG decided, ad hidden/removed, connection ended, emergency alert to eligible cleaners, correct deal-confirmed mail. |
| Business | Edit company details and locations; sign-up can be retried and survives e-mail confirmation; turnover times follow summer/winter time. |
| Household | Emergency screen after acceptance: message the cleaner, cancel, "did the cleaner come?", outcome of a previous request; honest fee wording. |
| Admin | Suspend / restore a user; report handling no longer republishes ads or claims actions that did not happen; settings now enforced (rate floor, banned words). |
| Frontend fixes | Header buttons on phones, admin tabs scroll on phones, long cleaner names, emergency time inputs, error and not-found pages, language switch keeps the query, search default sort matches its label, errors shown instead of swallowed. |
| Session | Session refresh in the proxy (no random sign-outs). |
| Security review fixes (Part 18, migration 0028) | An admin-hidden ad cannot be undone by deleting and re-creating it; a removed job cannot be put back online by its owner; distance search works again (it broke when the exact location was hidden) and measures to a point snapped to a ~1 km grid, so it cannot be used to find a home address. |
| Pricing stays inactive (Part 17, migration 0027) | `paymentsActive()` is true only when `MOLLIE_API_KEY` is present AND `PAYMENTS_ACTIVE=true`; without both, no customer, mandate, charge or subscription is ever created. Seeded prices are zeroed; a missing fee setting means EUR 0; the admin settings form defaults to 0,00. All public copy is price-neutral ("nothing is charged at the moment"); price wording appears only when an admin has set a price and payments are on. E-mails no longer promise a subscription. |
| Meetings lifecycle | A cleaner can accept, decline or propose another time; the household agrees, declines or withdraws; both sides are notified; database functions enforce who may do what. |
| Realtime chat | Messages and the meeting/deal panel update live (with the 8-second refresh as fallback). The content-security policy allows the Supabase websocket (`wss://`, and `ws://` for local testing). |
| Role separation and navigation | Household, cleaner, business and admin each get their own header/bottom navigation and guarded pages; admin is sent to `/admin` from role-specific pages; signed-in users skip login/sign-up; `?next=` is kept through login and e-mail confirmation; wrong-role visits get a clear notice instead of a silent redirect; cleaner home links jump to the right profile step; business Calendar only shows when turnover is enabled for the business type. |
| Cleaner ad | At least one availability slot is required to publish; the ad shows the moderation notice instead of "online" when held back; role is checked before every ad/profile write. |
| Reports | Ads, jobs, reviews and now single chat messages can be reported; for a message only that message is copied into the report (admins never get access to chats). |
| Retention and cleanup | Daily cron also purges old records (`purge_old_records`); rate limits and banned-word checks on messages; reports on reviews and jobs; hidden reviews. |
| Home page | Shows real published ads (best verified first, then newest); labelled samples only when there are none. |

## Verified here (development checks)

| Check | Result |
|---|---|
| Real Postgres, fresh database (all migrations 0001-0028) | 283 / 283 |
| Real Postgres, upgrade path (0001-0023 with data, then 0024-0028) | 453 / 453 |
| Parts 15 to 18 applied twice | no errors, no changes; a failing script rolls back completely |
| Unit tests (`npm test`) | 135 passed |
| Types, lint, translations (`npm run check:i18n`) | clean, 1358 keys per language, nl and en identical |
| Browser flows 1 to 13, phone and desktop | 503 checks passed |
| Website crawl (`e2e/audit.cjs`) | 150 pages, 0 problems |
| Application leak scan, six roles | outsiders never see VAT, contact or street; only a job's city |
| Charging gate | no payment, mandate or subscription code path runs while `PAYMENTS_ACTIVE` is not `true` |

Browser flows run against a stand-in for the database (`e2e/supa-emu.cjs`, which has no realtime server, so live chat
falls back to refresh there); the access rules are verified on the real Postgres suite. Neither is the live project.

## Order to bring the live project up to date (needs approval, not done)

1. Deploy the app version (it falls back gracefully until the parts are applied).
2. Run, in order, on the live database (only after the owner approves): migrations 0024 to 0028 (Deel 14 to 18). Each is safe to run twice. The local setup page does not yet contain Deel 17 and 18, and the live project must not be touched before the test project has been checked.
   verification query shown under 15d and 16f.
3. Add the environment variables listed in the README launch checklist.

## Not built or deliberately parked

- Business payment method (SEPA mandate) for month-end billing: nothing writes `mollie_customer_id`; billing cannot run, and no price is active. Deliberate while payments stay inactive.
- Meeting "met" status; per-location assignment of cleaners (the misleading display was removed).
- Admin: no jobs list/removal tab, no manual iCal sync button, no payments overview for businesses.
- A guest who starts "Post a job" and logs in as a household is redirected to home without a notice.
- A disputed work record is not yet routed to the cleaner/admin attention count.
- Linen add-on (settings screen labelled "phase 2, off").
- Cleaner minimum-rate hints in the form errors mention a EUR 15 example; the real minimum comes from the admin setting.
- Unused translation keys remain (harmless).

A separate test Supabase project can be set up with `TEST_SUPABASE_SETUP.md` (never the live project).

## Not verifiable from here

Live Supabase settings (exposed schemas, GraphQL exposure, SQL-editor transaction behaviour), e-mail delivery, domain,
Mollie, load and backup restore.

## DECISIONS FOR ME (owner)

Each of these was decided with the safest option so work could continue. Change any of them if you disagree.

1. **Production branch.** GitHub still shows `claude/new-session-iodsy8` as the default (and only original) branch and no `main`, although you said `main` was created. Chosen: all work goes to the separate branch `alieni-dev`, which only creates previews. Please re-check in GitHub (Settings -> Branches) and Vercel (Settings -> Environments -> Production Branch) that production is a branch that nobody works on.
2. **Public repository.** The GitHub repository is public. Chosen: nothing secret is in it, and the backup workflow refuses to run while it is public. Recommended: make it private before real data exists.
3. **The existing Supabase project is now the test database.** Chosen (by the owner): no new project; the project `alieni` (vfxhctncrjlbvasavluu) is used for testing because there are no real customers yet. A backup was taken first (see 12). The `alieni-dev` previews are connected to it through Preview-only variables for that branch; production variables were not changed. `LBH Test` was never touched.
4. **Original brief.** The code mentions "brief section ..." but the original brief is not in the repository. Chosen: only the planning document is in `docs/briefs/`. Please add the original brief there.
5. **Backups.** The weekly backup workflow is written but switched off. Chosen: dumps are encrypted and kept as workflow artifacts for 30 days. Switching it on needs two secrets (see `docs/BACKUP.md`).
6. **Distances.** Distance search measures to a point snapped to a ~1 km grid instead of the exact home, so a home address cannot be found by repeated searches. Chosen: privacy over exact kilometres.
7. **Removed jobs.** A job removed by its owner can no longer be put back online by the owner (there was no button for it anyway); an admin still can.
8. **`MOLLIE_WEBHOOK_SECRET`** is listed in `.env.example` but the code does not read it. Chosen: leave it, noted as unused.
9. **Test-database workflow guard.** The GitHub workflow "Set up TEST database" still refuses project `vfxhctncrjlbvasavluu` by design. It is not needed any more for this project (the migrations were applied directly); keep it for a future separate test project.
10. **"Run workflow" button.** GitHub only shows "Run workflow" for workflows that exist on the default branch, and the default branch is still `claude/new-session-iodsy8`, which must not be pushed to. Chosen: besides the manual trigger the workflow also starts when `test-database/RUN.txt` is edited on `alieni-dev` (no other file starts it). Remove the `push:` block in `.github/workflows/test-database.yml` if you do not want that.
11. **Supabase access token.** The workflow needs a Supabase access token, which belongs to your whole account. Chosen: it is only used for the test reference (live is refused before any request), and the guide says to delete the token after use.
12. **CLEAN OUT ALL TEST DATA BEFORE LAUNCH.** The project now holds test accounts and test data. Before launch delete every test account and its data (the six earlier test sign-ups, the four `alieni.*.test@example.com` logins including the test admin, the test ad, emergency request and work record), remove the test admin from `admin_allowlist`, and check that the tables are empty. A backup of the state before migrations 0024-0028 is in `backups/` (not in git: it holds e-mail addresses and password hashes). The project has no automatic Supabase backups on the free plan.
13. **Turn "Confirm email" back ON before launch.** It is currently OFF (it was already off when this work started), so test accounts work without a mailbox. The README says it must be ON before launch, because an admin allow-list address becomes admin at sign-up. Also set the Site URL (currently `http://localhost:3000`) to the real site address.
14. **The current production site runs old code against the new database.** Nobody uses it yet, so this is accepted for now. Measured by running the old code (commit 25c7d0e) against the migrated database: pages still open, but several features are empty or broken (see "Old production code against the new database" below). Deploying this branch to production fixes them; that needs your approval.
15. **Legacy price setting.** The settings row `business_unit_prices_cents` still holds the old placeholder amounts (hotel 3.00 ... school 99.00). Nothing reads it while payments are off (no Mollie key, `PAYMENTS_ACTIVE` unset); clean it up when pricing is decided.
16. **Vercel previews need a Vercel login.** The project has "Vercel authentication" on, so only logged-in team members can open previews. Chosen: leave it on.
17. **Tokens.** The Supabase access token and the Vercel token were saved as secrets on the Claude environment `alieni`. Delete both tokens (and remove the saved credentials from that environment) when you no longer need them.

## Old production code against the new database (measured)
Production (commit 25c7d0e) was run locally against the migrated database and all four roles were driven through it; every one of its 114 database queries was also run as each role.
- Still works: every page opens (54 of 56 checks), login for all roles, admin screens.
- Already broken before the migrations: the page of a single cleaner's ad (404) and the lists that embed it. The database has two paths between `cleaner_profiles` and `profiles` (through `favourites`), which the old queries did not disambiguate. Fixed in this branch (explicit relationship names in 11 files).
- Broken by the new migrations: the old code still reads a cleaner's full postcode (hidden since 0026), a company's details for guests (0024), `jobs` with `job_responses` (a second link since 0025) and writes a quotation directly (now only through `submit_job_quote`). Lists then show empty, not an error page.
- Fixed by deploying this branch.
