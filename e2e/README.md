# End-to-end tests

Run the real app against a local stand-in for Supabase (auth, PostgREST,
storage) and drive it with Playwright. No real project or keys needed.

```bash
node e2e/supa-emu.cjs &                       # port 4000
NEXT_PUBLIC_SUPABASE_URL=http://localhost:4000 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build
NEXT_PUBLIC_SUPABASE_URL=http://localhost:4000 NEXT_PUBLIC_SUPABASE_ANON_KEY=x PORT=3100 npx next start -p 3100 &
mkdir -p e2e/out
node e2e/flow.cjs    # sign-up → account → admin → photo upload → log out → log in (19 checks)
node e2e/flow2.cjs   # cleaner ad → search → favourite → meeting → masked chat → deal → unlocked (22 checks)
node e2e/flow3.cjs   # business sign-up → job → response → chat → deal → dashboard
node e2e/flow4.cjs   # cleaner ad → report → admin hide/restore → ads, users, settings → access control
node e2e/flow5.cjs … flow9.cjs   # roles, business foundations, search/fixes, privacy of company data (no flow7: emergency cover was removed on alieni-nl)
node e2e/flow10.cjs  # one-off cleaning, quotations, regular schedules: post, quote, accept, visits, cancel (61 checks)
# flow11 needs the service key (account export and deletion), so run a second instance on port 3101:
SUPABASE_SERVICE_ROLE_KEY=emu-service-key NEXT_PUBLIC_SUPABASE_URL=http://localhost:4000 NEXT_PUBLIC_SUPABASE_ANON_KEY=emu-anon-key npx next start -p 3101 &
node e2e/flow11.cjs  # download my data, delete my account, public ad privacy, no placeholders on the legal pages
node e2e/flow12.cjs  # reviews, business edits, banned words, suspend (port 3101 too)
node e2e/flow13.cjs  # price-neutral copy, meeting lifecycle (propose/agree/withdraw), job report (31 checks)
node e2e/flow14.cjs  # logged-out visitor: homepage + public pages open (phone hero), private pages → login → back (35 checks)
node e2e/flow15.cjs  # business pricing model: per location / per job post / tiers / free — overview, type page, sign-up, homepage, About (18 checks)
node e2e/audit.cjs   # crawls every linked page on mobile + desktop: status, console errors, overflow
```

## Real-Postgres check of the access rules (`npm run test:rls`)

The browser flows run against `supa-emu.cjs`, a small stand-in that **does not evaluate the SQL access rules**
(row-level security). Rules that point at each other ("infinite recursion detected in policy"), missing grants and
wrong policies are therefore invisible to it. `e2e/pg/rls-check.sh` closes that gap: it loads all migrations into a
scratch database on a real Postgres (with small stand-ins for Supabase's auth/storage and PostGIS), then

1. reads every table and view as anon, household, cleaner, business and admin (this plans every rule, so a loop shows up),
2. runs the business sign-up, unit, job and cleaner-ad path as real users (a work record shows the company to that cleaner),
3. runs the quotation, award, regular-schedule and cancel flows (Part 15) and the hardening checks of Part 16 (moderation, privacy of a cleaner's home, erasure),
4. `UPGRADE=1` loads 0001–0023 with data first and then applies the later parts on top, like the live database.

Needs a running Postgres 16 and a role that can create a database:
`PGHOST=<socket dir or host> PGPORT=5432 PGUSER=<role> npm run test:rls`. Run it after every new migration.
