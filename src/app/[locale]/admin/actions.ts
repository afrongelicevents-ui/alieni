"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { errorCode, requireUser } from "@/lib/auth";
import { reporterUpdateEmail } from "@/lib/email";
import { adModeratedNotice, appBaseUrl, notifyUser } from "@/lib/notify";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
import { z } from "zod";
import { PRICING_MODELS, SERVICE_KEYS } from "@/lib/services";
import type { SettingsValues } from "@/lib/admin/data";
import { videoEmbedUrl } from "@/lib/video";
import { fromBusinessPricingForm, serializeBusinessPricing } from "@/lib/business-pricing";

export type AdminActionState = { ok: boolean; error?: string; url?: string };

async function requireAdmin() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("not_admin");
  return { supabase, userId };
}

async function audit(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], adminId: string, action: string, subject: string, details?: Record<string, unknown>) {
  await supabase.from("admin_audit_log").insert({ admin_id: adminId, action, subject, details: details ?? null });
}

/** Hide / remove / dismiss / restore a report; cleaner ads follow the outcome; reporter is notified. */
export async function resolveReport(reportId: string, outcome: "hidden" | "removed" | "dismissed" | "open"): Promise<AdminActionState> {
  try {
    const { supabase, userId } = await requireAdmin();
    const { data: report } = await supabase.from("reports").select("id, subject_type, subject_id, reporter_id").eq("id", reportId).maybeSingle();
    if (!report) return { ok: false, error: "not_found" };
    const statusMap = { hidden: "resolved_hidden", removed: "resolved_removed", dismissed: "dismissed", open: "open" } as const;
    // Apply the content change first: if it fails the report must not show as resolved (the action is safe to repeat).
    let contentChanged = false;
    let ownerToTell: { userId: string; status: "hidden" | "removed" } | null = null;
    if (report.subject_type === "cleaner_profile") {
      const { data: ad, error: adReadErr } = await supabase.from("cleaner_profiles").select("status, moderated, user_id").eq("id", report.subject_id).maybeSingle();
      if (adReadErr) return { ok: false, error: "save_failed" };
      if (ad) {
        let next: "hidden" | "removed" | "published" | null = null;
        if (outcome === "removed") next = "removed";
        else if (outcome === "hidden") next = ad.status === "removed" ? null : "hidden";
        // dismissed / re-opened: only give back an ad that an admin hid (moderated); never touch drafts or owner-hidden ads
        else if (ad.status === "hidden" && ad.moderated === true) next = "published";
        if (next && next !== ad.status) {
          const { error: adErr } = await supabase.from("cleaner_profiles").update({ status: next }).eq("id", report.subject_id);
          if (adErr) return { ok: false, error: "save_failed" };
          if (next !== "published" && ad.user_id) ownerToTell = { userId: ad.user_id as string, status: next };
        }
        const finalStatus = next ?? ad.status;
        contentChanged = (outcome === "hidden" || outcome === "removed") && (finalStatus === "hidden" || finalStatus === "removed");
      }
    } else if (report.subject_type === "job" && (outcome === "hidden" || outcome === "removed")) {
      const { data: job, error: jobReadErr } = await supabase.from("jobs").select("status").eq("id", report.subject_id).maybeSingle();
      if (jobReadErr) return { ok: false, error: "save_failed" };
      // An awarded ('filled') job is locked by the database; it is left as it is.
      if (job && job.status !== "filled") {
        if (job.status !== "removed") {
          const { error: jobErr } = await supabase.from("jobs").update({ status: "removed" }).eq("id", report.subject_id);
          if (jobErr) return { ok: false, error: "save_failed" };
        }
        contentChanged = true;
      }
    } else if (report.subject_type === "review") {
      // a reported review is hidden from the public (and given back when the report is dismissed or re-opened)
      const { error: revErr } = await supabase.from("reviews").update({ hidden: outcome === "hidden" || outcome === "removed" }).eq("id", report.subject_id);
      if (revErr) return { ok: false, error: "save_failed" };
      contentChanged = outcome === "hidden" || outcome === "removed";
    }
    const { error } = await supabase.from("reports").update({ status: statusMap[outcome], resolved_at: outcome === "open" ? null : new Date().toISOString() }).eq("id", reportId);
    if (error) return { ok: false, error: "save_failed" };
    if (ownerToTell) {
      const base = await appBaseUrl();
      const adStatus = ownerToTell.status;
      await notifyUser(ownerToTell.userId, (lang) => adModeratedNotice(base, adStatus, lang));
    }
    await audit(supabase, userId, `report_${outcome}`, `report:${reportId}`, { subject_type: report.subject_type, subject_id: report.subject_id });
    // DSA: tell the reporter the outcome (needs the service role to look up the e-mail).
    if (outcome !== "open" && report.reporter_id) {
      // notifyUser is best effort and never throws; it sends in the reporter's own language.
      await notifyUser(report.reporter_id, (lang) => reporterUpdateEmail(outcome, contentChanged, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Admin takes an ad offline / puts it back. */
export async function setAdStatusAdmin(adId: string, status: "published" | "hidden" | "removed"): Promise<AdminActionState> {
  try {
    const { supabase, userId } = await requireAdmin();
    const { data: before } = await supabase.from("cleaner_profiles").select("status, user_id").eq("id", adId).maybeSingle();
    const { error } = await supabase.from("cleaner_profiles").update({ status }).eq("id", adId);
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, `ad_${status}`, `ad:${adId}`);
    // Tell the cleaner why the ad went offline (best effort).
    if ((status === "hidden" || status === "removed") && before?.user_id && before.status !== status) {
      const base = await appBaseUrl();
      await notifyUser(before.user_id as string, (lang) => adModeratedNotice(base, status, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

const cents = (euro: string) => {
  const n = Number(String(euro).replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** Platform settings → `settings` table (prices apply to new subscriptions). */
export async function saveSettings(values: SettingsValues): Promise<AdminActionState> {
  const household = cents(values.householdPriceEuro);
  const floor = cents(values.rateFloorEuro);
  if ([household, floor].some((x) => x === null)) return { ok: false, error: "invalid" };
  const videoUrl = (values.videoUrl ?? "").trim();
  if (videoUrl !== "" && !videoEmbedUrl(videoUrl)) return { ok: false, error: "invalid_video" };
  const businessPricing = values.businessPricing ? fromBusinessPricingForm(values.businessPricing) : null;
  if (values.businessPricing && !businessPricing) return { ok: false, error: "invalid_business_pricing" };
  try {
    const { supabase, userId } = await requireAdmin();
    const rows = [
      { key: "household_fee_cents", value: household },
      { key: "rate_floor_cents", value: floor },
      { key: "banned_words", value: values.bannedWords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) },
      { key: "homepage_video_url", value: videoUrl },
      ...(businessPricing ? [{ key: "business_pricing", value: serializeBusinessPricing(businessPricing) }] : []),
    ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "settings_saved", "settings", { keys: rows.map((r) => r.key) });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

// ========== Phase 1: services, pricing rules, fee events ==========

/** Switch a service on/off and limit it to business types (empty = all). */
export async function saveServiceCatalog(serviceKey: string, enabled: boolean, businessTypes: string[]): Promise<AdminActionState> {
  if (!(SERVICE_KEYS as readonly string[]).includes(serviceKey)) return { ok: false, error: "invalid" };
  const types = businessTypes.filter((t) => (BUSINESS_TYPE_KEYS as readonly string[]).includes(t));
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("service_catalog").update({ enabled, business_types: types, updated_at: new Date().toISOString(), updated_by: userId }).eq("service_key", serviceKey);
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "service_catalog_saved", serviceKey, { enabled, types });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

const ruleSchema = z.object({
  serviceKey: z.enum(SERVICE_KEYS),
  businessType: z.enum(["", ...BUSINESS_TYPE_KEYS] as ["", ...BusinessType[]]),
  model: z.enum(PRICING_MODELS),
  amountEuro: z.string().trim().max(12),
  percent: z.string().trim().max(6),
  unit: z.string().trim().max(30),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(300),
});
export type PricingRuleInput = z.input<typeof ruleSchema>;

/** Add a pricing rule. New rules start INACTIVE; activate them explicitly. */
export async function savePricingRule(input: PricingRuleInput): Promise<AdminActionState> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const r = parsed.data;
  const amount = r.model === "none" || r.model === "percent" ? 0 : cents(r.amountEuro);
  const pct = r.model === "percent" ? Number(r.percent.replace(",", ".")) : null;
  if (amount === null || (r.model === "percent" && (!Number.isFinite(pct) || pct! < 0 || pct! > 100))) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("pricing_rules").insert({
      service_key: r.serviceKey,
      business_type: r.businessType || null,
      model: r.model,
      amount_cents: amount,
      percent: pct,
      unit: r.unit || null,
      valid_from: r.validFrom,
      valid_to: r.validTo || null,
      active: false,
      notes: r.notes || null,
      created_by: userId,
    });
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "pricing_rule_added", r.serviceKey, { model: r.model, amount, type: r.businessType || "all" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function setPricingRuleActive(ruleId: string, active: boolean): Promise<AdminActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(ruleId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("pricing_rules").update({ active }).eq("id", ruleId);
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, active ? "pricing_rule_activated" : "pricing_rule_deactivated", ruleId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Park a recorded fee event (it will never be invoiced). */
export async function waiveFeeEvent(eventId: string, reason: string): Promise<AdminActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("fee_events").update({ status: "waived", waived_reason: reason.trim().slice(0, 200) || "waived by admin" }).eq("id", eventId).eq("status", "pending");
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "fee_event_waived", eventId, { reason });
    revalidatePath("/admin/fees");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Suspend or restore an account. A suspended person cannot sign in (the login is banned) and their ad is hidden;
 * restoring lifts the ban but leaves the ad for an admin to restore separately. Administrators cannot be suspended.
 */
export async function setUserSuspended(targetId: string, suspended: boolean): Promise<AdminActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    if (targetId === userId) return { ok: false, error: "self" };
    const { data: target } = await supabase.from("profiles").select("role").eq("id", targetId).maybeSingle();
    if (!target) return { ok: false, error: "not_found" };
    if (target.role === "admin") return { ok: false, error: "is_admin" };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { ok: false, error: "not_configured" };
    const admin = createSupabaseAdmin(url, key, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: suspended ? "876000h" : "none" });
    if (error) return { ok: false, error: "failed" };
    if (suspended) await supabase.from("cleaner_profiles").update({ status: "hidden" }).eq("user_id", targetId).eq("status", "published");
    await audit(supabase, userId, suspended ? "user_suspended" : "user_restored", targetId);
    revalidatePath("/admin/users");
    revalidatePath("/admin/ads");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

// ========== Website: testimonials (brief §8) ==========

const testimonialSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80),
  city: z.string().trim().max(80),
  quote: z.string().trim().min(1).max(600),
  consent: z.literal(true),
  published: z.boolean(),
});
export type TestimonialInput = z.input<typeof testimonialSchema>;

/** Add a REAL testimonial. Consent is required; nothing is ever pre-filled. */
export async function addTestimonial(input: TestimonialInput): Promise<AdminActionState> {
  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { name, role, city, quote, published } = parsed.data;
    const { error } = await supabase.from("testimonials").insert({ name, role: role || null, city: city || null, quote, consent: true, published, created_by: userId });
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "testimonial_added", name, { published });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function setTestimonialPublished(id: string, published: boolean): Promise<AdminActionState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("testimonials").update({ published }).eq("id", id);
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, published ? "testimonial_published" : "testimonial_hidden", id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function deleteTestimonial(id: string): Promise<AdminActionState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase.from("testimonials").delete().eq("id", id);
    if (error) return { ok: false, error: "save_failed" };
    await audit(supabase, userId, "testimonial_deleted", id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
