# Architecture map

**Stack:** Next.js 16 (App Router) · Tailwind v4 · next-intl (nl default, en) · Supabase (Postgres with row-level security,
Auth, Storage, Realtime; EU region) · Resend (e-mail) · Mollie (payments, NOT active) · Vercel (hosting, crons).

## Roles
household · cleaner · business · admin. A role is stored in `profiles.role`; admin is granted at sign-up by the
`admin_allowlist` table. Each role has its own navigation and guarded pages (`src/lib/guard.ts`, `src/components/layout/useNavRole.ts`).

## Code
| Path | Content |
|---|---|
| `src/app/[locale]/` | Pages and server actions per area: `search`, `cleaners`, `profile` (cleaner ad wizard), `work` (cleaner work), `jobs`, `business/*`, `emergency`, `messages`, `favourites`, `account`, `admin/*`, `reviews`, legal pages. |
| `src/app/api/` | `cron/*` (daily bundle), `mollie/webhook`, `invoices/*`, `account/export`. |
| `src/components/` | UI grouped by area (`chat`, `cleaners`, `business`, `jobs`, `admin`, `layout` …). |
| `src/lib/` | Data access (`*-data.ts`), rules (`jobs.ts`, `services-shared.ts`), `mollie.ts` (charging gate), `notify.ts` + `email.ts` (locale-aware e-mails), `site-settings.ts`, `auth.ts`, `guard.ts`. |
| `src/proxy.ts` | Session refresh and locale routing. |
| `messages/nl.json`, `messages/en.json` | All text; key sets must be identical (`npm run check:i18n`). |
| `supabase/migrations/` | `0001` … `0029`, applied in order. Each is safe to run twice. |
| `e2e/` | Browser flows (`flow*.cjs`), stand-in database (`supa-emu.cjs`), real-Postgres checks (`pg/`). |

## Data and privacy rules worth knowing
- Row-level security is on for every table; helper views (`business_public`, VOG badges, slot units) expose only what is public.
- Phone numbers, e-mail addresses and links in chat are masked until both sides confirm a deal.
- Admins cannot read chats. A reported message is copied into the report as a snapshot.
- A cleaner's full postcode and exact location are never public (only the postcode area).
- Account deletion (`erase_user_data`) and data export (`/api/account/export`) exist for users.
- Old chats and handled reports are purged by the daily cron (`purge_old_records`).

## Pricing and payments
Nothing is charged unless `MOLLIE_API_KEY` is set **and** `PAYMENTS_ACTIVE=true` **and** a price is set in Admin.
Prices live in the database (`settings`, `pricing_rules`), not in the code. The public text is price-neutral.

## Scheduled work
`vercel.json` runs two crons: `/api/cron/daily` (check-ins, calendar sync, emergency alerts, job housekeeping and purge)
and `/api/cron/business-billing` (does nothing while payments are off). Both need `CRON_SECRET`.
