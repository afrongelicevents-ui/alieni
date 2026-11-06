"use server";

import { findBannedWord, getBannedWords, getRateFloorCents } from "@/lib/site-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { dbErrorCode } from "@/lib/db-errors";
import { jobServiceKey } from "@/lib/jobs";
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
  frequency: z.enum(["once", "daily", "weekly", "biweekly", "monthly", "per_checkout"]),
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
  if (j.frequency !== "per_checkout" && !j.startDate) return { ok: false, error: "start_date" };
  if (j.frequency !== "per_checkout" && !j.visitStart) return { ok: false, error: "visit_time" };
  if (j.startDate && j.startDate < new Date(Date.now() - 864e5).toISOString().slice(0, 10)) return { ok: false, error: "start_date" };
  if (j.endDate && (!recurring || !j.startDate || j.endDate < j.startDate)) return { ok: false, error: "end_date" };
  if ((j.frequency === "weekly" || j.frequency === "biweekly") && j.weekdays.length === 0) return { ok: false, error: "weekdays" };
  if (j.budgetCents < (await getRateFloorCents())) return { ok: false, error: "rate" };
  if (findBannedWord(`${j.description} ${j.scheduleNote}`, await getBannedWords())) return { ok: false, error: "banned_word" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id, business_type").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    if (!(await assertServiceEnabled(jobServiceKey(j.frequency), (bp.business_type as import("@/lib/business").BusinessType | null) ?? null))) return { ok: false, error: "service_off" };
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        business_id: bp.id,
        status: "published",
        space_type: j.spaceType,
        size_m2: j.sizeM2,
        unit_id: j.unitId,
        postcode: j.postcode,
        city: j.city || null,
        frequency: j.frequency,
        schedule_note: j.scheduleNote || null,
        description: j.description,
        budget_cents: j.budgetCents,
        start_date: j.startDate,
        end_date: j.endDate,
        weekdays: [...new Set(j.weekdays)].sort(),
        visit_start: j.visitStart,
        visit_hours: j.visitHours,
        published_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 864e5).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.message === "service not available") return { ok: false, error: "service_off" };
      if (error?.message === "start date required" || error?.message === "start date in the past") return { ok: false, error: "start_date" };
      return { ok: false, error: dbErrorCode(error) };
    }
    revalidatePath("/jobs");
    revalidatePath("/business/dashboard");
    revalidatePath("/business/requests");
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function removeJob(jobId: string): Promise<JobActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("jobs").update({ status: "removed" }).eq("id", jobId);
    if (error) return { ok: false, error: error.message === "job is awarded" ? "awarded" : dbErrorCode(error) };
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
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("submit_job_quote", { p_job_id: jobId, p_rate_cents: rateCents, p_message: text, p_valid_until: validUntil || null });
    if (error) return { ok: false, error: dbErrorCode(error) };
    const res = (data ?? {}) as { result?: string; business_user_id?: string };
    if (res.result !== "sent") return { ok: false, error: res.result ?? "save_failed" };
    if (res.business_user_id) {
      const base = await appBaseUrl();
      await notifyUser(res.business_user_id, (lang) => quoteReceivedNotice(base, lang));
    }
    revalidatePath("/jobs");
    revalidatePath("/work");
    revalidatePath("/business/requests");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

type Decision = { result?: string; cleaner_user_id?: string; declined_user_ids?: string[]; other_user_id?: string; by?: string };

/** The business accepts a quotation: the job is awarded and its work is scheduled. */
export async function acceptQuote(responseId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(responseId)) return { ok: false, error: "not_available" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("accept_job_response", { p_response_id: responseId });
    if (error) return { ok: false, error: dbErrorCode(error) };
    const res = (data ?? {}) as Decision;
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
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("decline_job_response", { p_response_id: responseId });
    if (error) return { ok: false, error: dbErrorCode(error) };
    const res = (data ?? {}) as Decision;
    if (res.result !== "declined") return { ok: false, error: res.result ?? "save_failed" };
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
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("cancel_awarded_job", { p_job_id: jobId });
    if (error) return { ok: false, error: dbErrorCode(error) };
    const res = (data ?? {}) as Decision;
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

/** Business opens (or reuses) a chat with a cleaner who responded. */
export async function startConversation(cleanerProfileId: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(cleanerProfileId)) return { ok: false, error: "sample_subject" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: cp } = await supabase.from("cleaner_profiles").select("user_id").eq("id", cleanerProfileId).maybeSingle();
    if (!cp) return { ok: false, error: "not_available" };
    const { data: existing } = await supabase.from("conversations").select("id").eq("household_id", userId).eq("cleaner_id", cp.user_id).maybeSingle();
    if (existing) return { ok: true, conversationId: existing.id };
    const { data, error } = await supabase.from("conversations").insert({ household_id: userId, cleaner_id: cp.user_id }).select("id").single();
    if (error || !data) return { ok: false, error: "save_failed" };
    return { ok: true, conversationId: data.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
