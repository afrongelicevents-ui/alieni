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
node e2e/flow3.cjs   # business sign-up → turnovers → job → response → chat → deal → slots → emergency (19 checks)
node e2e/flow4.cjs   # VOG upload → report → admin hide/restore → VOG approve → settings → access control (16 checks)
node e2e/audit.cjs   # crawls every linked page on mobile + desktop: status, console errors, overflow
```

## Real-Postgres check of the access rules (`npm run test:rls`)

The browser flows run against `supa-emu.cjs`, a small stand-in that **does not evaluate the SQL access rules**
(row-level security). Rules that point at each other ("infinite recursion detected in policy"), missing grants and
wrong policies are therefore invisible to it. `e2e/pg/rls-check.sh` closes that gap: it loads all migrations into a
scratch database on a real Postgres (with small stand-ins for Supabase's auth/storage and PostGIS), then

1. reads every table and view as anon, household, cleaner, business and admin (this plans every rule, so a loop shows up),
2. runs the business sign-up, job, emergency-cover (accept, work record, fee event, cancel) path as real users.

Needs a running Postgres 16 and a role that can create a database:
`PGHOST=<socket dir or host> PGPORT=5432 PGUSER=<role> npm run test:rls`. Run it after every new migration.
