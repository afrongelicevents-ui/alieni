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
- [x] **Image uploads**: profile photos and site photos are re-encoded server-side with sharp (EXIF stripped, resized, WebP) into public buckets scoped by RLS to the owner; VOG files go to a private bucket readable by admin only via 5-minute signed URLs and are deleted by trigger after review; turnover photos go to a private bucket
- [ ] **Mollie webhook URL** uses an unguessable path segment in addition to API fetch-back verification
- [x] Business v2 security review completed (see above); re-run on the final release diff
- [x] Notification e-mails never contain message bodies (`lib/notify.ts`): new-message and deal notices link to the app only; chat text is masked server-side before it is stored (`messages/actions.ts`)

## Reporting

Suspected vulnerabilities: email the owner (see site contact). Do not open a
public GitHub issue for security reports.

## Go-live review (household, business and admin on the database)

| Area | Control |
|---|---|
| Server actions | Every write goes through a server action that re-checks the session (`lib/auth.ts`) and relies on RLS as the real boundary; inputs validated with Zod |
| Conversations | Membership re-checked in code on top of RLS; a third account gets "not found" (e2e flow2) |
| Deal activation | Database trigger sets `active` only when both confirmations are present; `verified_jobs_count` only changes inside that trigger |
| Admin | `requireAdmin()` in every admin action; all actions logged to `admin_audit_log`; admin role only via the allow-list migration |
| Emergency | Street address hidden from the open-requests view; visible to the accepting cleaner only; accept is an atomic SQL function |
| Mollie | Checkout URL comes from Mollie; connection is claimed (`mollie_subscription_id = 'pending'`) before charging so webhook replays cannot double-charge |
| Password reset | Supabase recovery flow; the request form always reports "sent" so addresses cannot be enumerated |

## Independent review of the go-live build — fixed in `0018_security_golive.sql`

| Finding | Severity | Fix |
|---|---|---|
| Mollie customer/mandate ids on `profiles`/`business_profiles` were readable and writable by the row owner; the webhook resolved the payer by that column | High | Column-level grants: those columns are no longer readable or writable via the API; payment actions use the service role; household payments carry `metadata.profile_id` and the webhook verifies the stored customer id matches |
| `connections` had no column restrictions: a party could set the other party's confirmation, `status`, or `mollie_subscription_id` | High | Triggers: each party may only change its own confirmation; status only to `ended` or back to `pending`; server-managed columns frozen; activation runs after the guard |
| Masking applied in the server action only; a direct API insert could store raw contact details | Medium | `enforce_message_masking` now rewrites the body in the database (`mask_contacts_sql`) until a connection is active |
| "See each other" policies exposed whole profile rows | Medium | Column grants limit API-visible columns to id, role, display name, city, locale, created_at |
| Host-header-derived URLs for Mollie | Low | `NEXT_PUBLIC_APP_URL` / Vercel production URL preferred; request host only in development |
| Uploads before validation (slot id, VOG date) | Low | Validate and check ownership before any storage write; vog bucket now has size/mime limits |
| Household could "accept" its own meeting request | Low | Policy restricted to the cleaner; action re-checks ownership |
| Open emergency view exposed the full postcode; requester could self-assign a cleaner | Low | View returns the 4-digit area; trigger freezes `accepted_by`/fee, requester may only cancel |
| `unit_price_cents` sent by the client at business sign-up | Low | Locked by a database trigger from settings at creation |
| Admin allow-list grants the role at sign-up | Info | Owner must keep "Confirm email" ON in Supabase Auth (README launch checklist) |
