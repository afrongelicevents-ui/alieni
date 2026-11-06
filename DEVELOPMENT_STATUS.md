# Alieni: development status

State of the repository at the end of the development phase. Nothing here has been committed, pushed, deployed or run on
the live database; the new database parts (14, 15, 16, 17) are files in `supabase/migrations/` that still have to be applied.

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
| Pricing stays inactive (Part 17, migration 0027) | `paymentsActive()` is true only when `MOLLIE_API_KEY` is present AND `PAYMENTS_ACTIVE=true`; without both, no customer, mandate, charge or subscription is ever created. Seeded prices are zeroed; a missing fee setting means EUR 0; the admin settings form defaults to 0,00. All public copy is price-neutral ("nothing is charged at the moment"); price wording appears only when an admin has set a price and payments are on. E-mails no longer promise a subscription. |
| Meetings lifecycle | A cleaner can accept, decline or propose another time; the household agrees, declines or withdraws; both sides are notified; database functions enforce who may do what. |
| Realtime chat | Messages and the meeting/deal panel update live (with the 8-second refresh as fallback). The content-security policy allows the Supabase websocket (`wss://`, and `ws://` for local testing). |
| Role separation and navigation | Household, cleaner, business and admin each get their own header/bottom navigation and guarded pages; admin is sent to `/admin` from role-specific pages; signed-in users skip login/sign-up; `?next=` is kept through login and e-mail confirmation; wrong-role visits get a clear notice instead of a silent redirect; cleaner home links jump to the right profile step; business Calendar only shows when turnover is enabled for the business type. |
| Cleaner ad | At least one availability slot is required to publish; the ad shows the moderation notice instead of "online" when held back; role is checked before every ad/profile write. |
| Retention and cleanup | Daily cron also purges old records (`purge_old_records`); rate limits and banned-word checks on messages; reports on reviews and jobs; hidden reviews. |
| Home page | Shows real published ads (best verified first, then newest); labelled samples only when there are none. |

## Verified here (development checks)

| Check | Result |
|---|---|
| Real Postgres, fresh database (all migrations 0001-0027) | 280 / 280 |
| Real Postgres, upgrade path (0001-0023 with data, then 0024-0027) | 450 / 450 |
| Parts 15, 16, 17 applied twice | no errors, no changes; a failing script rolls back completely |
| Unit tests (`npm test`) | 135 passed |
| Types, lint, translations (`npm run check:i18n`) | clean, 1358 keys per language, nl and en identical |
| Browser flows 1 to 13, phone and desktop | 499 checks passed |
| Website crawl (`e2e/audit.cjs`) | 150 pages, 0 problems |
| Application leak scan, six roles | outsiders never see VAT, contact or street; only a job's city |
| Charging gate | no payment, mandate or subscription code path runs while `PAYMENTS_ACTIVE` is not `true` |

Browser flows run against a stand-in for the database (`e2e/supa-emu.cjs`, which has no realtime server, so live chat
falls back to refresh there); the access rules are verified on the real Postgres suite. Neither is the live project.

## Order to bring the live project up to date (needs approval, not done)

1. Deploy the app version (it falls back gracefully until the parts are applied).
2. Run, in order, on the live database: Deel 14, 15a-15d, 16a-16f and 17 (migration 0027) from the setup page (the setup page is not yet updated with Deel 17) (each is safe to run twice), then the
   verification query shown under 15d and 16f.
3. Add the environment variables listed in the README launch checklist.

## Not built or deliberately parked

- Business payment method (SEPA mandate) for month-end billing: nothing writes `mollie_customer_id`; billing cannot run, and no price is active. Deliberate while payments stay inactive.
- Meeting "met" status; per-location assignment of cleaners (the misleading display was removed).
- Reports exist for ads, reviews and jobs; messages have no report button.
- Admin: no jobs list/removal tab, no manual iCal sync button, no payments overview for businesses.
- A guest who starts "Post a job" and logs in as a household is redirected to home without a notice.
- A disputed work record is not yet routed to the cleaner/admin attention count.
- Linen add-on (settings screen labelled "phase 2, off").
- Cleaner minimum-rate hints in the form errors mention a EUR 15 example; the real minimum comes from the admin setting.
- Unused translation keys remain (harmless).

## Not verifiable from here

Live Supabase settings (exposed schemas, GraphQL exposure, SQL-editor transaction behaviour), e-mail delivery, domain,
Mollie, load and backup restore.
