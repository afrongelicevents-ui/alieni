"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";

export type JobActionState = { ok: boolean; error?: string; id?: string; conversationId?: string };

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
});
export type JobInput = z.input<typeof jobSchema>;

/** Post a job (free). Requires a business profile. */
export async function createJob(input: JobInput): Promise<JobActionState> {
  const parsed = jobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const j = parsed.data;
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
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
        published_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 864e5).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "save_failed" };
    revalidatePath("/jobs");
    revalidatePath("/business/dashboard");
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function removeJob(jobId: string): Promise<JobActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("jobs").update({ status: "removed" }).eq("id", jobId);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/jobs");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Cleaner responds to a job with a rate and a message. */
export async function respondToJob(jobId: string, rateCents: number, message: string): Promise<JobActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "sample_subject" };
  if (!Number.isInteger(rateCents) || rateCents < DEFAULT_RATE_FLOOR_CENTS) return { ok: false, error: "rate" };
  const text = message.trim();
  if (!text || text.length > 1000) return { ok: false, error: "message" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: cp } = await supabase.from("cleaner_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!cp) return { ok: false, error: "no_ad" };
    const { error } = await supabase.from("job_responses").insert({ job_id: jobId, cleaner_profile_id: cp.id, rate_cents: rateCents, message: text });
    if (error) return { ok: false, error: error.code === "23505" ? "already" : "save_failed" };
    revalidatePath("/jobs");
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
