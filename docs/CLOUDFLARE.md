# Alieni on Cloudflare (free plan) — branch `alieni-cloudflare`

The same website as `alieni-nl`, without Supabase: Cloudflare Workers (site), D1 (database), R2 (photos),
Better Auth (logins), Resend (e-mail, optional). Payments are off. Decisions: `docs/DECISIONS.md`.

## One-time set-up (about 5 minutes)

GitHub deploys the site on every push to `alieni-cloudflare` (`.github/workflows/deploy-cloudflare.yml`). It needs two
repository secrets. Everything else (database, photo storage, secret keys, test data) the workflow creates itself.

1. **Cloudflare account** — sign up free at dash.cloudflare.com if you have none. Open **Workers & Pages** once; if it
   asks for a `workers.dev` subdomain, pick one (e.g. `alieni`).
2. **API token** — Cloudflare → top-right profile icon → **My Profile** → **API Tokens** → **Create Token** →
   template **"Edit Cloudflare Workers"** → **Use template** → under *Permissions* click **+ Add more** and add
   **Account · D1 · Edit** (R2 and Workers are already in the template) → *Account Resources*: your account →
   **Continue to summary** → **Create Token** → copy it.
3. **Account ID** — Cloudflare → **Workers & Pages** → right-hand column **Account ID** → copy.
4. **GitHub** — github.com/afrongelicevents-ui/alieni → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**:
   - Name `CLOUDFLARE_API_TOKEN`, value: the token from step 2.
   - Name `CLOUDFLARE_ACCOUNT_ID`, value: the ID from step 3.
   - Name `SEED_ADMIN_PASSWORD`, value: a password **you choose** (at least 12 characters) for the test admin
     `admin@alieni.test`. It is never printed anywhere (this repository is public). Without it, no admin is created.
5. **Deploy** — GitHub → **Actions** → **Deploy to Cloudflare (alieni-cloudflare)** → **Run workflow** → branch
   `alieni-cloudflare` → **Run workflow**. After ~5 minutes the run's summary shows the live link
   (`https://alieni.<your-subdomain>.workers.dev`).

Optional, for e-mail (account confirmation, password reset, notifications):
6. resend.com → free account → **API Keys** → **Create API Key** → copy → GitHub secret `RESEND_API_KEY`.
   To send to everyone (not only to yourself), add and verify your domain in Resend (**Domains** → **Add Domain**, add
   the DNS records it shows), then GitHub → **Settings → Secrets and variables → Actions → Variables** → variable
   `EMAIL_FROM` = `Alieni <no-reply@your-domain>`. Run the workflow again. With a Resend key, new accounts must
   confirm their e-mail address; without it, they can sign in straight away.

## Test logins (test data is added once, into an empty database)

| Role | E-mail | Password |
|---|---|---|
| Household | household@alieni.test | Test-Household-2026 |
| Cleaner | cleaner@alieni.test | Test-Cleaner-2026 |
| Business | business@alieni.test | Test-Business-2026 |
| Admin | admin@alieni.test | the `SEED_ADMIN_PASSWORD` you chose (step 4) |

The admin must set up two-step login on first sign-in (any authenticator app: Google Authenticator, Microsoft
Authenticator, 1Password…). More demo accounts (other cleaners, a hotel, a second household) use `Test-Other-2026`.
This repository is public, so the household/cleaner/business test passwords above are public too: anyone can sign in
with them. They have no special rights, but suspend or delete them (Admin → Users) before real people use the site.

## What runs where (all free)

| Part | Cloudflare product | Free limit that matters |
|---|---|---|
| Website + API | Workers (`alieni`, workers.dev) | 100 000 requests/day, 10 ms CPU per request, 3 MiB script (we use ~2.4 MiB) |
| Database | D1 `alieni` | 5 GB, 5 M reads + 100 000 writes per day |
| Photos | R2 bucket `alieni-files` (private) | 10 GB, 1 M writes + 10 M reads per month |
| Daily job (check-ins, job expiry, visits, clean-up) | Cron trigger `17 5 * * *` | 5 cron triggers |

## Test locally

```bash
npm ci
bash e2e/cf/run.sh            # fresh local D1 + test data, builds the Worker, serves it on :8787, runs all flows
```
Flows (`e2e/cf/*.cjs`) run on a 390 px phone and on desktop and check the real D1 rows and R2 files.
