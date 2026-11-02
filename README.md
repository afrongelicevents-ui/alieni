# Alieni

**Connect · Clean · Thrive**

Alieni is a two-sided advertising marketplace (mobile-first, PWA-ready) that connects
households and businesses in the Netherlands with independent cleaners. Alieni is not
a cleaning company and does not employ cleaners — it only connects the two sides.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript) + Tailwind CSS v4
- [Supabase](https://supabase.com) — EU-hosted Postgres, Auth, Storage, Realtime (row-level security)
- [Mollie](https://mollie.com) — iDEAL, SEPA mandates, recurring subscriptions
- i18n with next-intl — Dutch (default) and English

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (app runs on labelled sample data without them)
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) — run `npm run build` first to generate route types |
| `npm test` | Unit tests (Vitest) |

## Project conventions

- All money amounts are **integer euro cents** (`src/lib/money.ts`). Household prices
  are always shown including 21% btw; business prices excluding btw.
- Minimum hourly rate for cleaners is €15/hour by default (`src/lib/validation.ts`),
  admin-configurable, enforced in UI **and** server-side.
- No "Verified"/"Vetted" claims anywhere until verification is defined
  (decision 2026-11-01) — we say "Real client reviews" instead.
- Sample data (`src/lib/sample-data.ts`) must always be clearly labelled in the UI.
- Security headers (CSP, HSTS, etc.) live in `next.config.ts`.

## Build phases

1. ✅ Foundation: setup, design tokens, i18n, security headers, CI with tests
2. ⏳ Marketplace MVP: homepage ✅, cleaner ad wizard, search + filters, profiles, favourites, reports
3. Meetings & chat (realtime, contact masking)
4. Payments (Mollie mandates, mutual deal confirmation, subscriptions, invoices)
5. Business side (job posts, responses, configurable pricing)
6. Admin dashboard + automations
7. Launch hardening (security review, legal pages, accessibility audit)

## Vercel crons and the Hobby plan

Vercel's Hobby plan allows **two** cron jobs per project, each **once a day**
(any other `vercel.json` fails the whole deploy). So `vercel.json` schedules:

- `/api/cron/business-billing` daily at 20:45 UTC (month-end direct debit)
- `/api/cron/daily` daily at 05:17 UTC, which runs check-ins, iCal sync and
  emergency clean-up in one go

On Vercel Pro, replace the bundle with the individual routes at their intended
frequencies: `checkins` daily, `ical-sync` `*/30 * * * *`, `emergency`
`*/10 * * * *`. Emergency requests still expire correctly inside the app
(`expireIfDue` runs on every read); only the clean-up is daily until then.

## Launch checklist (owner)

0. Supabase → Authentication → Sign In / Providers → Email: **Confirm email ON** before launch (the admin allow-list grants the role at sign-up, so the owner's address must be verified).
1. Supabase → Authentication → URL configuration: Site URL = the live URL; add `https://<live>/**` to redirect URLs (needed for e-mail confirmation and password reset links).
2. Vercel env: `SUPABASE_SERVICE_ROLE_KEY` (e-mail notifications, admin e-mail column, crons), `RESEND_API_KEY` (+ verified sending domain), `MOLLIE_API_KEY` (live key, after KYC), `CRON_SECRET`, optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, optional `NEXT_PUBLIC_APP_URL`.
3. Mollie dashboard: webhook URL `https://<live>/api/mollie/webhook`; enable iDEAL + SEPA Direct Debit.
4. Fill `COMPANY_DETAILS` in `src/lib/invoices.ts` (KvK, BTW) before the first invoice.
5. Admin → Settings: confirm prices; Admin → Photos: upload final photos.
6. Run the e2e suite (see `e2e/README.md`) before every release.
