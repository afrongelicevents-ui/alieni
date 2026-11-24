"use server";

import { findBannedWord, getBannedWords, getRateFloorCents } from "@/lib/site-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser, requireUserRole } from "@/lib/auth";
import { jobServiceKey } from "@/lib/jobs";
import { generateJobVisits, amsterdamToUtcIso } from "@/lib/jobs-data";
import { all, batch, first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";
import { appBaseUrl, jobCancelledNotice, notifyUser, quoteAcceptedNotice, quoteDeclinedNotice, quoteReceivedNotice } from "@/lib/notify";
import { assertServiceEnabled } from "@/lib/services";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";

export type JobActionState = { ok: boolean; error?: string; id?: string; conversationId?: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)));
const jobSchema = z.object({
  spaceType: z.enum(["office", "shop", "airbnb", "hospitality", "other"]),
  sizeM2: z.number().int().min(1).max(100000).nullable(),
  unitId: z.string().uuid().nullable(),
  postcode: dutchPostcodeSchema,
  city: z.string().trim().max(80),
  frequency: z.enum(["once", "daily", "weekly", "biweekly", "monthly"]),
  scheduleNote: z.string().trim().max(300),
  description: z.string().trim().min(10).max(2000),
  budgetCents: z.number().int().min(DEFAULT_RATE_FLOOR_CENTS).max(50000),
  startDate: dateSchema.nullable(),
  endDate: dateSchema.nullable(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  visitStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  visitHours: z.number().min(0.5).max(24).nullable(),
});
export type JobInput = z.input<typeof jobSchema>;

/** Post a job (free). Requires a business profile and the service switched on for the business type. */
export async function createJob(input: JobInput): Promise<JobActionState> {
  const parsed = jobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const j = parsed.data;
  const recurring = ["daily", "weekly", "biweekly", "monthly"].includes(j.frequency);
  if (!j.startDate) return { ok: false, error: "start_date" };
  if (!j.visitStart) return { ok: false, error: "visit_time" };
  if (j.startDate && j.startDate < new Date(Date.now() - 864e5).toISOString().slice(0, 10)) return { ok: false, error: "start_date" };
  if (j.endDate && (!recurring || !j.startDate || j.endDate < j.startDate)) return { ok: false, error: "end_date" };
  if ((j.frequency === "weekly" || j.frequency === "biweekly") && j.weekdays.length === 0) return { ok: false, error: "weekdays" };
  if (j.budgetCents < (await getRateFloorCents())) return { ok: false, error: "rate" };
  if (findBannedWord(`${j.description} ${j.scheduleNote}`, await getBannedWords())) return { ok: false, error: "banned_word" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await first<{ id: string; business_type: import("@/lib/business").BusinessType | null }>("SELECT id, business_type FROM business_profiles WHERE user_id = ?", userId);
    if (!bp) return { ok: false, error: "no_business" };
    if (!(await assertServiceEnabled(jobServiceKey(j.frequency), bp.business_type ?? null))) return { ok: false, error: "service_off" };
    // the unit must be one of this business's own locations
    if (j.unitId && !(await first("SELECT 1 AS x FROM business_units WHERE id = ? AND business_id = ?", j.unitId, bp.id))) return { ok: false, error: "invalid" };
    if (!(await rateLimit(`job:${userId}`, 20, 86400))) return { ok: false, error: "rate_limit" };
    const id = uuid();
    const now = nowIso();
    await run(
      `INSERT INTO jobs (id, business_id, status, space_type, size_m2, unit_id, postcode, city, frequency, schedule_note, description, budget_cents,
                         start_date, end_date, weekdays, visit_start, visit_hours, published_at, expires_at)
       VALUES (?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, bp.id, j.spaceType, j.sizeM2, j.unitId, j.postcode, j.city || null, j.frequency, j.scheduleNote || null, j.description, j.budgetCents,
      j.startDate, recurring ? j.endDate : null, JSON.stringify([...new Set(j.weekdays)].sort()), j.visitStart, j.visitHours,
      now, new Date(Date.now() + 60 * 864e5).toISOString(),
    );
    revalidatePath("/jobs");
    revalidatePath("/business/dashboard");
    revalidatePath("/business/requests");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function removeJob(jobId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "not_found" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const job = await first<{ status: string }>(
      "SELECT j.status FROM jobs j JOIN business_profiles bp ON bp.id = j.business_id WHERE j.id = ? AND bp.user_id = ?", jobId, userId);
    if (!job) return { ok: false, error: "not_found" };
    if (job.status === "filled") return { ok: false, error: "awarded" };
    await run("UPDATE jobs SET status = 'removed' WHERE id = ? AND status <> 'filled'", jobId);
    revalidatePath("/jobs");
    revalidatePath("/business/requests");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Cleaner sends a quotation for a job: hourly rate, a message and how long the quotation is valid. */
export async function respondToJob(jobId: string, rateCents: number, message: string, validUntil?: string | null): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "sample_subject" };
  if (!Number.isInteger(rateCents) || rateCents < DEFAULT_RATE_FLOOR_CENTS) return { ok: false, error: "rate" };
  const text = message.trim();
  if (!text || text.length > 1000) return { ok: false, error: "message" };
  if (findBannedWord(text, await getBannedWords())) return { ok: false, error: "banned_word" };
  if (validUntil && !dateSchema.safeParse(validUntil).success) return { ok: false, error: "valid_until" };
  try {
    const { userId } = await requireUserRole(["cleaner"]);
    const res = await submitQuote(userId, jobId, rateCents, text, validUntil || null);
    if (res.result !== "sent") return { ok: false, error: res.result };
    if (res.businessUserId) {
      const base = await appBaseUrl();
      await notifyUser(res.businessUserId, (lang) => quoteReceivedNotice(base, lang));
    }
    revalidatePath("/jobs");
    revalidatePath("/work");
    revalidatePath("/business/requests");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Was submit_job_quote: a published ad, rate ≥ the floor, a message, valid 0–90 days, one quotation per job. */
async function submitQuote(userId: string, jobId: string, rateCents: number, msg: string, validUntil: string | null): Promise<{ result: string; businessUserId?: string }> {
  const cp = await first<{ id: string; status: string }>("SELECT id, status FROM cleaner_profiles WHERE user_id = ?", userId);
  if (!cp) return { result: "no_ad" };
  if (cp.status !== "published") return { result: "no_ad" };
  const j = await first<{ status: string; expires_at: string | null; business_user_id: string }>(
    "SELECT j.status, j.expires_at, bp.user_id AS business_user_id FROM jobs j JOIN business_profiles bp ON bp.id = j.business_id WHERE j.id = ?", jobId);
  if (!j || j.status !== "published" || (j.expires_at && j.expires_at < nowIso())) return { result: "not_available" };
  if (j.business_user_id === userId) return { result: "not_available" };
  const floor = Math.max(DEFAULT_RATE_FLOOR_CENTS, await getRateFloorCents());
  if (!Number.isInteger(rateCents) || rateCents < floor) return { result: "rate" };
  const message = msg.trim().slice(0, 1000);
  if (!message) return { result: "message" };
  const today = new Date().toISOString().slice(0, 10);
  const vu = validUntil ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  if (vu < today || vu > new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)) return { result: "valid_until" };
  if (await first("SELECT 1 AS x FROM job_responses WHERE job_id = ? AND cleaner_profile_id = ?", jobId, cp.id)) return { result: "already" };
  if (!(await rateLimit(`quote:${userId}`, 30, 86400))) return { result: "rate_limit" };
  await run("INSERT INTO job_responses (id, job_id, cleaner_profile_id, rate_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (job_id, cleaner_profile_id) DO NOTHING",
    uuid(), jobId, cp.id, rateCents, message, vu);
  return { result: "sent", businessUserId: j.business_user_id };
}

type Decision = { result?: string; cleaner_user_id?: string; declined_user_ids?: string[]; other_user_id?: string; by?: string };

/** The business accepts a quotation: the job is awarded and its work is scheduled. */
export async function acceptQuote(responseId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(responseId)) return { ok: false, error: "not_available" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const res = await acceptResponse(userId, responseId);
    if (res.result !== "accepted") return { ok: false, error: res.result ?? "save_failed" };
    const base = await appBaseUrl();
    if (res.cleaner_user_id) await notifyUser(res.cleaner_user_id, (lang) => quoteAcceptedNotice(base, lang));
    for (const uid of res.declined_user_ids ?? []) await notifyUser(uid, (lang) => quoteDeclinedNotice(base, lang));
    revalidatePath("/jobs");
    revalidatePath("/business/requests");
    revalidatePath("/business/work");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function declineQuote(responseId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(responseId)) return { ok: false, error: "not_available" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const r = await first<{ id: string; status: string; cleaner_user_id: string }>(
      `SELECT r.id, r.status, cp.user_id AS cleaner_user_id FROM job_responses r
       JOIN jobs j ON j.id = r.job_id JOIN business_profiles bp ON bp.id = j.business_id
       JOIN cleaner_profiles cp ON cp.id = r.cleaner_profile_id
       WHERE r.id = ? AND bp.user_id = ?`, responseId, userId);
    if (!r) return { ok: false, error: "not_allowed" };
    if (r.status !== "sent") return { ok: false, error: "not_available" };
    await run("UPDATE job_responses SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'sent'", nowIso(), r.id);
    const res: Decision = { result: "declined", cleaner_user_id: r.cleaner_user_id };
    if (res.cleaner_user_id) { const base = await appBaseUrl(); await notifyUser(res.cleaner_user_id, (lang) => quoteDeclinedNotice(base, lang)); }
    revalidatePath("/business/requests");
    revalidatePath("/jobs");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Either party cancels an awarded job; future visits disappear from both planners. */
export async function cancelAwardedJob(jobId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "not_available" };
  try {
    const { userId } = await requireUser();
    const res = await cancelAwarded(userId, jobId);
    if (res.result !== "cancelled") return { ok: false, error: res.result ?? "save_failed" };
    if (res.other_user_id) { const base = await appBaseUrl(); const byBusiness = res.by === "business"; await notifyUser(res.other_user_id, (lang) => jobCancelledNotice(base, byBusiness, lang)); }
    revalidatePath("/business/requests");
    revalidatePath("/business/work");
    revalidatePath("/work");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Business opens (or reuses) a chat with a cleaner who sent a quotation on one of its jobs. */
export async function startConversation(cleanerProfileId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(cleanerProfileId)) return { ok: false, error: "sample_subject" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const cp = await first<{ user_id: string }>(
      `SELECT cp.user_id FROM cleaner_profiles cp
       WHERE cp.id = ? AND EXISTS (SELECT 1 FROM job_responses r JOIN jobs j ON j.id = r.job_id JOIN business_profiles bp ON bp.id = j.business_id
                                   WHERE r.cleaner_profile_id = cp.id AND bp.user_id = ?)`, cleanerProfileId, userId);
    if (!cp) return { ok: false, error: "not_available" };
    const existing = await first<{ id: string }>("SELECT id FROM conversations WHERE household_id = ? AND cleaner_id = ?", userId, cp.user_id);
    if (existing) return { ok: true, conversationId: existing.id };
    const id = uuid();
    await run("INSERT INTO conversations (id, household_id, cleaner_id) VALUES (?, ?, ?) ON CONFLICT (household_id, cleaner_id) DO NOTHING", id, userId, cp.user_id);
    const row = await first<{ id: string }>("SELECT id FROM conversations WHERE household_id = ? AND cleaner_id = ?", userId, cp.user_id);
    if (!row) return { ok: false, error: "save_failed" };
    return { ok: true, conversationId: row.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Was accept_job_response: award the job, decline the other open quotations, schedule the work (all or nothing). */
async function acceptResponse(userId: string, responseId: string): Promise<Decision> {
  const r = await first<{ id: string; job_id: string; cleaner_profile_id: string; status: string; valid_until: string | null; cleaner_user_id: string }>(
    "SELECT r.id, r.job_id, r.cleaner_profile_id, r.status, r.valid_until, cp.user_id AS cleaner_user_id FROM job_responses r JOIN cleaner_profiles cp ON cp.id = r.cleaner_profile_id WHERE r.id = ?", responseId);
  if (!r) return { result: "not_available" };
  const j = await first<{ id: string; business_id: string; status: string; frequency: string; start_date: string | null; visit_start: string | null; visit_hours: number | null; owner: string }>(
    "SELECT j.id, j.business_id, j.status, j.frequency, j.start_date, j.visit_start, j.visit_hours, bp.user_id AS owner FROM jobs j JOIN business_profiles bp ON bp.id = j.business_id WHERE j.id = ?", r.job_id);
  if (!j || j.owner !== userId) return { result: "not_allowed" };
  if (j.status !== "published" || r.status !== "sent") return { result: "not_available" };
  if (r.valid_until && r.valid_until < new Date().toISOString().slice(0, 10)) return { result: "expired" };
  const declined = await all<{ user_id: string }>(
    "SELECT cp.user_id FROM job_responses o JOIN cleaner_profiles cp ON cp.id = o.cleaner_profile_id WHERE o.job_id = ? AND o.id <> ? AND o.status = 'sent'", j.id, r.id);
  const now = nowIso();
  const stmts: [string, ...(string | number | null)[]][] = [
    // the WHERE status = 'published' makes a double click or a race a no-op
    ["UPDATE jobs SET status = 'filled', awarded_response_id = ?, awarded_at = ? WHERE id = ? AND status = 'published'", r.id, now, j.id],
    ["UPDATE job_responses SET status = 'accepted', decided_at = ? WHERE id = ? AND status = 'sent' AND (SELECT awarded_response_id FROM jobs WHERE id = ?) = ?", now, r.id, j.id, r.id],
    ["UPDATE job_responses SET status = 'declined', decided_at = ? WHERE job_id = ? AND id <> ? AND status = 'sent' AND (SELECT awarded_response_id FROM jobs WHERE id = ?) = ?", now, j.id, r.id, j.id, r.id],
  ];
  if (j.frequency === "once") {
    const s = j.start_date ? amsterdamToUtcIso(j.start_date, (j.visit_start ?? "09:00").slice(0, 5)) : null;
    const e = s ? new Date(Date.parse(s) + (j.visit_hours ?? 2) * 3600e3).toISOString() : null;
    stmts.push([
      `INSERT INTO work_records (id, business_id, cleaner_profile_id, service_key, reference_table, reference_id, job_id, scheduled_start, scheduled_end, outcome)
       SELECT ?, ?, ?, 'oneoff', 'jobs', ?, ?, ?, ?, 'scheduled' WHERE (SELECT awarded_response_id FROM jobs WHERE id = ?) = ?
       ON CONFLICT (reference_table, reference_id) DO NOTHING`,
      uuid(), j.business_id, r.cleaner_profile_id, j.id, j.id, s, e, j.id, r.id,
    ]);
  }
  await batch(stmts);
  const after = await first<{ awarded_response_id: string | null }>("SELECT awarded_response_id FROM jobs WHERE id = ?", j.id);
  if (after?.awarded_response_id !== r.id) return { result: "not_available" };
  if (j.frequency !== "once") await generateJobVisits(j.id, 28);
  return { result: "accepted", cleaner_user_id: r.cleaner_user_id, declined_user_ids: declined.map((d) => d.user_id) };
}

/** Was cancel_awarded_job: either party ends an awarded job; future scheduled visits are cancelled, done ones stay. */
async function cancelAwarded(userId: string, jobId: string): Promise<Decision> {
  const j = await first<{ id: string; status: string; ended_at: string | null; biz_user: string; cleaner_user: string | null }>(
    `SELECT j.id, j.status, j.ended_at, bp.user_id AS biz_user, cp.user_id AS cleaner_user
     FROM jobs j JOIN business_profiles bp ON bp.id = j.business_id
     LEFT JOIN job_responses r ON r.id = j.awarded_response_id LEFT JOIN cleaner_profiles cp ON cp.id = r.cleaner_profile_id
     WHERE j.id = ?`, jobId);
  if (!j || j.status !== "filled" || j.ended_at) return { result: "not_available" };
  const actor = j.biz_user === userId ? "business" : j.cleaner_user === userId ? "cleaner" : null;
  if (!actor) return { result: "not_allowed" };
  const now = nowIso();
  await batch([
    ["UPDATE jobs SET ended_at = ?, ended_by = ? WHERE id = ? AND ended_at IS NULL", now, actor, j.id],
    ["UPDATE work_records SET outcome = 'cancelled', updated_at = ? WHERE job_id = ? AND outcome = 'scheduled' AND (scheduled_start IS NULL OR scheduled_start > ?)", now, j.id, now],
  ]);
  return { result: "cancelled", by: actor, other_user_id: (actor === "business" ? j.cleaner_user : j.biz_user) ?? undefined };
}
