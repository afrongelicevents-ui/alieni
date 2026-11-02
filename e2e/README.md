# End-to-end tests

Run the real app against a local stand-in for Supabase (auth, PostgREST,
storage) and drive it with Playwright. No real project or keys needed.

```bash
node e2e/supa-emu.cjs &                       # port 4000
NEXT_PUBLIC_SUPABASE_URL=http://localhost:4000 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build
NEXT_PUBLIC_SUPABASE_URL=http://localhost:4000 NEXT_PUBLIC_SUPABASE_ANON_KEY=x PORT=3100 npx next start -p 3100 &
mkdir -p e2e/out
node e2e/flow.cjs    # sign-up → account → admin → photo upload → log out → log in (19 checks)
node e2e/audit.cjs   # crawls every linked page on mobile + desktop: status, console errors, overflow
```
