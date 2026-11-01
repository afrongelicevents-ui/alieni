# Alieni security notes

Security requirements come from the project brief §7 and are non-negotiable.
This file tracks what is enforced where, plus the items that must be switched
on at launch.

## Enforced in code / database today

| Control | Where |
|---|---|
| Row-level security on every table; users only read their own chats, requests, payments | `supabase/migrations/0001–0004` |
| Admin role cannot be self-assigned (policy + trigger) | `0004_security_hardening.sql` |
| `verified_jobs_count` only system-maintained | `0004_security_hardening.sql` |
| Contact masking enforced by DB trigger, not client code | `0002_meetings_chat.sql` |
| Reviews only writable by parties of a mutually confirmed connection | `0002_meetings_chat.sql` |
| Payments/invoices written only by service role from verified webhooks | `0003_payments.sql` (no insert policies) |
| Mollie webhook: authenticity via API fetch-back, idempotent upserts, strict id validation | `src/app/api/mollie/webhook/route.ts` |
| Rate floor (€15/h) and postcode format enforced in the database | `0001_initial_schema.sql` |
| Report flooding backstop: max 10/user/hour in the database | `0004_security_hardening.sql` |
| Security headers: CSP, HSTS, nosniff, frame denial, referrer & permissions policy | `next.config.ts` |
| Server-only secrets (`server-only` import for Mollie; service key only in the webhook route) | `src/lib/mollie.ts` |
| Input validation with Zod + integer-cent money (no float drift) | `src/lib/validation.ts`, `src/lib/money.ts` |
| No `dangerouslySetInnerHTML` / `eval`; user content rendered via React escaping | verified in review |

## Pre-launch checklist (must be done before go-live)

- [ ] **Email verification** on in Supabase Auth settings; **MFA (2FA) required** for the admin account
- [ ] **Rate limiting** on login, signup, messaging, meeting requests and reports at the edge (Vercel WAF / Upstash); DB backstop exists for reports only
- [ ] **Bot protection** on signup (Cloudflare Turnstile)
- [ ] **Nonce-based CSP**: `script-src` currently allows `'unsafe-inline'` (Next.js inline hydration); switch to nonces via proxy before launch
- [ ] **Image uploads** (profile photos): type/size checks, re-encode, strip EXIF, private bucket + signed URLs — not built yet, build with the upload feature
- [ ] **Mollie webhook URL** uses an unguessable path segment in addition to API fetch-back verification
- [ ] Re-run the full security review (`/security-review`) on the release diff
- [ ] Server-side contact masking also at the edge function that sends notification emails (do not leak raw message bodies into email)

## Reporting

Suspected vulnerabilities: email the owner (see site contact). Do not open a
public GitHub issue for security reports.
