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

## Business v2 review (M1–M7) — findings fixed in `0013_security_v2.sql`

| Finding | Severity | Fix |
|---|---|---|
| Server-only RPC functions (`businesses_due_for_billing`, `checkin_candidates`, `next_invoice_number`, `expire_emergency_requests`, `has_active_connection`) executable by any user — leaked Mollie customer ids, allowed burning invoice numbers | High | Execute revoked from `public/anon/authenticated`, granted to `service_role` only |
| SSRF: iCal cron fetched any URL a business pasted (incl. cloud metadata / internal hosts) | High | `isSafeIcalUrl`: https only, allow-list of calendar providers, no IP literals/localhost/credentials; enforced in cron and dashboard; tested |
| Connected cleaner could edit any open slot's times or mark it done without reserving | Medium | Trigger restricts cleaners to open→reserved (self) and reserved(self)→done; all other fields read-only |
| Emergency request spam | Low | Trigger: max 3 requests per user per 24h |
| Cron secret compared with `!==` | Low | Constant-time comparison (`lib/cron-auth.ts`) on every cron route |

Reviewed and found sound: VOG storage policies (owner upload, admin-only read, file deleted on review), emergency address exposure (view hides the street address until acceptance), slot visibility limited to connected cleaners, invoice PDF/CSV scoped by RLS, business signup never persists the password locally, webhook business path idempotent on payment id.

## Pre-launch checklist (must be done before go-live)

- [ ] **Email verification** on in Supabase Auth settings; **MFA (2FA) required** for the admin account
- [ ] **Rate limiting** on login, signup, messaging, meeting requests and reports at the edge (Vercel WAF / Upstash); DB backstop exists for reports, in-memory damping on the Mollie webhook; Turnstile covers signup
- [x] **Bot protection** on signup: Turnstile widget integrated; activates with NEXT_PUBLIC_TURNSTILE_SITE_KEY + the secret in Supabase Auth settings
- [x] **CSP decision**: nonce-based CSP would force dynamic rendering of every page (currently statically generated, Lighthouse 100). Accepted risk: `script-src 'unsafe-inline'` remains, mitigated by React escaping, zero `dangerouslySetInnerHTML`, and no third-party scripts except Turnstile (explicitly allow-listed). Revisit if user-generated HTML is ever rendered
- [ ] **Image uploads** (profile photos): type/size checks, re-encode, strip EXIF, private bucket + signed URLs — not built yet, build with the upload feature
- [ ] **Mollie webhook URL** uses an unguessable path segment in addition to API fetch-back verification
- [x] Business v2 security review completed (see above); re-run on the final release diff
- [ ] Server-side contact masking also at the edge function that sends notification emails (do not leak raw message bodies into email)

## Reporting

Suspected vulnerabilities: email the owner (see site contact). Do not open a
public GitHub issue for security reports.
