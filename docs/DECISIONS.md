# Alieni on Cloudflare — decisions (branch `alieni-cloudflare`)

Each decision in one or two lines: what was chosen and why. Newest at the bottom of each section.

## Hosting and build
1. **Next.js on Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`). The UI, pages and texts stay exactly as on
   `alieni-nl`; only the backend changes. Rebuilding the UI in another framework would change the look and take longer.
2. **Next.js 16.4.6** (from 16.4.3): OpenNext needs ≥ 16.4.5.
3. **Free plan only.** No paid Cloudflare products: no Images transformations, no Queues, no paid KV/R2 classes beyond
   the free allowance, no Workers Paid. `wrangler.jsonc` uses only Workers, D1, R2, a cron trigger and static assets.
4. **Image optimisation off** (`images.unoptimized`). The Next image optimiser would need Cloudflare Images. The bundled
   photos are already small WebP files; uploads are resized in the browser.
5. **Custom worker entry (`worker.ts`)** wraps the OpenNext worker to add the free daily cron (`17 5 * * *`), which calls
   `/api/cron/daily` with `CRON_SECRET`.
6. **Deploys run in GitHub Actions**, not from the development container (it cannot reach Cloudflare). The workflow
   creates D1 and R2 if needed, applies migrations, seeds test data and deploys to `*.workers.dev`.

## Database (D1)
7. **Fresh SQLite schema** (`db/migrations/0001_init.sql`) with only what alieni-nl uses. Same table and column names as
   before where possible, so the pages keep working; ids are random UUID text, times ISO text, lists JSON text.
8. **Dropped with payments OFF:** invoices, payments, billing periods, Mollie columns and webhook, invoice PDFs, the
   monthly billing cron, pricing rules and the fee-event ledger (they only recorded what *would* be charged).
   The admin's business pricing model setting stays (it only changes what is shown).
9. **No row-level security in D1**, so every read and write is behind a server-side check: `requireUser`,
   `requireUserRole`, `requireAdmin` (src/lib/auth.ts) plus an ownership check in each query (`WHERE user_id = ?`).
   The browser never talks to the database.
10. **Exact locations stay private:** cleaners' and units' exact points are stored but only used server-side; search
    measures to a ~1 km grid point, as before.

## Logins (Better Auth on D1)
11. **Better Auth 1.7 with the Kysely D1 dialect**, e-mail + password, sessions in D1 (no cookie cache, so a deleted or
    suspended account is signed out on the next request).
12. **Passwords hashed with PBKDF2-SHA256 (100 000 rounds, Web Crypto)** instead of Better Auth's default scrypt:
    scrypt in JavaScript exceeds the free plan's 10 ms CPU per request; Web Crypto runs natively.
13. **Roles:** household / cleaner / business chosen at sign-up; **admin only via the `admin_allowlist` table**. A
    database hook corrects any other role the browser sends (tested: asking for "admin" gives "household").
14. **E-mail confirmation is required whenever e-mail can be sent** (`RESEND_API_KEY` set). Without a Resend key,
    accounts work without confirmation, because otherwise nobody could sign up at all.
15. **Admin needs two-step login (TOTP, Better Auth `twoFactor` plugin).** An admin without it is sent to a set-up page
    before any admin page or admin action works.
16. **Rate limits in D1** (Worker memory is not shared): Better Auth's own limits on sign-in / sign-up / 2FA / reset,
    plus a small `rate_limits` table for messages, reports and uploads.

## Files (R2)
17. **One private R2 bucket.** Nothing is public; pages get **signed links valid for one hour**
    (`/api/files/…?e=…&s=…`, HMAC-SHA256). Whoever creates a link has checked the viewer may see the file.
18. **Photos are resized and re-encoded to WebP in the browser** (canvas; this drops EXIF/GPS), and the **server strips
    any remaining metadata** (EXIF/XMP chunks in WebP, APP1–APP15/COM in JPEG, text/eXIf chunks in PNG), checks the
    real file type from its bytes and caps the size at 2 MB. No server-side resizing: that would need paid Images.
