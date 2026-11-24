"use server";

import { revalidatePath } from "next/cache";
import { errorCode, requireAdmin } from "@/lib/auth";
import { reporterUpdateEmail } from "@/lib/email";
import { adModeratedNotice, appBaseUrl, notifyUser } from "@/lib/notify";
import { BUSINESS_TYPE_KEYS } from "@/lib/business";
import { z } from "zod";
import { SERVICE_KEYS } from "@/lib/services-shared";
import type { SettingsValues } from "@/lib/admin/data";
import { videoEmbedUrl } from "@/lib/video";
import { fromBusinessPricingForm, serializeBusinessPricing } from "@/lib/business-pricing";
import { batch, first, nowIso, run, uuid } from "@/lib/server/db";

export type AdminActionState = { ok: boolean; error?: string; url?: string };

/**
 * Admin actions. Every action starts with requireAdmin() (admin role + two-step login) and writes an audit row.
 * Ids from the browser are validated before use; all SQL is parameterised.
 */
const UUID = /^[0-9a-f-]{36}$/i;
const USER_ID = /^[A-Za-z0-9_-]{8,64}$/; // Better Auth user ids

async function audit(adminId: string, action: string, subject: string, details?: Record<string, unknown>) {
  await run("INSERT INTO admin_audit_log (admin_id, action, subject, details) VALUES (?, ?, ?, ?)", adminId, action, subject, details ? JSON.stringify(details) : null);
}

/** Admin changes an ad's status; hidden/removed by an admin = moderated (the owner cannot undo it). */
async function setAdStatus(adId: string, status: "published" | "hidden" | "removed") {
  await run("UPDATE cleaner_profiles SET status = ?, moderated = ?, updated_at = ? WHERE id = ?", status, status !== "published", nowIso(), adId);
}

/** Hide / remove / dismiss / restore a report; cleaner ads follow the outcome; reporter is notified. */
export async function resolveReport(reportId: string, outcome: "hidden" | "removed" | "dismissed" | "open"): Promise<AdminActionState> {
  if (!UUID.test(reportId) || !["hidden", "removed", "dismissed", "open"].includes(outcome)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireAdmin();
    const report = await first<{ id: string; subject_type: string; subject_id: string; reporter_id: string | null }>("SELECT id, subject_type, subject_id, reporter_id FROM reports WHERE id = ?", reportId);
    if (!report) return { ok: false, error: "not_found" };
    const statusMap = { hidden: "resolved_hidden", removed: "resolved_removed", dismissed: "dismissed", open: "open" } as const;
    // Apply the content change first: if it fails the report must not show as resolved (the action is safe to repeat).
    let contentChanged = false;
    let ownerToTell: { userId: string; status: "hidden" | "removed" } | null = null;
    if (report.subject_type === "cleaner_profile") {
      const ad = await first<{ status: string; moderated: number; user_id: string }>("SELECT status, moderated, user_id FROM cleaner_profiles WHERE id = ?", report.subject_id);
      if (ad) {
        let next: "hidden" | "removed" | "published" | null = null;
        if (outcome === "removed") next = "removed";
        else if (outcome === "hidden") next = ad.status === "removed" ? null : "hidden";
        // dismissed / re-opened: only give back an ad that an admin hid (moderated); never touch drafts or owner-hidden ads
        else if (ad.status === "hidden" && ad.moderated) next = "published";
        if (next && next !== ad.status) {
          await setAdStatus(report.subject_id, next);
          if (next !== "published") ownerToTell = { userId: ad.user_id, status: next };
        }
        const finalStatus = next ?? ad.status;
        contentChanged = (outcome === "hidden" || outcome === "removed") && (finalStatus === "hidden" || finalStatus === "removed");
      }
    } else if (report.subject_type === "job" && (outcome === "hidden" || outcome === "removed")) {
      const job = await first<{ status: string }>("SELECT status FROM jobs WHERE id = ?", report.subject_id);
      // An awarded ('filled') job is left as it is.
      if (job && job.status !== "filled") {
        if (job.status !== "removed") await run("UPDATE jobs SET status = 'removed' WHERE id = ? AND status <> 'filled'", report.subject_id);
        contentChanged = true;
      }
    } else if (report.subject_type === "review") {
      // a reported review is hidden from the public (and given back when the report is dismissed or re-opened)
      await run("UPDATE reviews SET hidden = ? WHERE id = ?", outcome === "hidden" || outcome === "removed", report.subject_id);
      contentChanged = outcome === "hidden" || outcome === "removed";
    }
    await run("UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?", statusMap[outcome], outcome === "open" ? null : nowIso(), reportId);
    if (ownerToTell) {
      const base = await appBaseUrl();
      const adStatus = ownerToTell.status;
      await notifyUser(ownerToTell.userId, (lang) => adModeratedNotice(base, adStatus, lang));
    }
    await audit(userId, `report_${outcome}`, `report:${reportId}`, { subject_type: report.subject_type, subject_id: report.subject_id });
    // DSA: tell the reporter the outcome, in their own language (best effort, never throws).
    if (outcome !== "open" && report.reporter_id) {
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
  if (!UUID.test(adId) || !["published", "hidden", "removed"].includes(status)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireAdmin();
    const before = await first<{ status: string; user_id: string }>("SELECT status, user_id FROM cleaner_profiles WHERE id = ?", adId);
    if (!before) return { ok: false, error: "not_found" };
    await setAdStatus(adId, status);
    await audit(userId, `ad_${status}`, `ad:${adId}`);
    // Tell the cleaner why the ad went offline (best effort).
    if ((status === "hidden" || status === "removed") && before.status !== status) {
      const base = await appBaseUrl();
      await notifyUser(before.user_id, (lang) => adModeratedNotice(base, status, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

const cents = (euro: string) => {
  const n = Number(String(euro).replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) : null;
};

/** Platform settings → `settings` table (JSON values). Payments stay off whatever is saved here. */
export async function saveSettings(values: SettingsValues): Promise<AdminActionState> {
  const household = cents(values.householdPriceEuro);
  const floor = cents(values.rateFloorEuro);
  if (household === null || floor === null) return { ok: false, error: "invalid" };
  const videoUrl = String(values.videoUrl ?? "").trim().slice(0, 500);
  if (videoUrl !== "" && !videoEmbedUrl(videoUrl)) return { ok: false, error: "invalid_video" };
  const businessPricing = values.businessPricing ? fromBusinessPricingForm(values.businessPricing) : null;
  if (values.businessPricing && !businessPricing) return { ok: false, error: "invalid_business_pricing" };
  try {
    const { userId } = await requireAdmin();
    const words = String(values.bannedWords ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 500);
    const rows: [string, unknown][] = [
      ["household_fee_cents", household],
      ["rate_floor_cents", floor],
      ["banned_words", words],
      ["homepage_video_url", videoUrl],
      ...(businessPricing ? [["business_pricing", serializeBusinessPricing(businessPricing)] as [string, unknown]] : []),
      ...(typeof values.signupsPaused === "boolean" ? [["signups_paused", values.signupsPaused] as [string, unknown]] : []),
    ];
    const at = nowIso();
    await batch(rows.map(([key, value]) => ["INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, JSON.stringify(value), at]));
    await audit(userId, "settings_saved", "settings", { keys: rows.map(([k]) => k) });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Switch a service on/off and limit it to business types (empty = all). */
export async function saveServiceCatalog(serviceKey: string, enabled: boolean, businessTypes: string[]): Promise<AdminActionState> {
  if (!(SERVICE_KEYS as readonly string[]).includes(serviceKey)) return { ok: false, error: "invalid" };
  const types = (Array.isArray(businessTypes) ? businessTypes : []).filter((t) => (BUSINESS_TYPE_KEYS as readonly string[]).includes(t));
  try {
    const { userId } = await requireAdmin();
    await run("UPDATE service_catalog SET enabled = ?, business_types = ?, updated_at = ?, updated_by = ? WHERE service_key = ?", Boolean(enabled), JSON.stringify(types), nowIso(), userId, serviceKey);
    await audit(userId, "service_catalog_saved", serviceKey, { enabled: Boolean(enabled), types });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Suspend or restore an account. A suspended person is signed out everywhere, cannot sign in again and their ad
 * is hidden; restoring lets them sign in but leaves the ad for an admin to restore separately.
 * Administrators cannot be suspended.
 */
export async function setUserSuspended(targetId: string, suspended: boolean): Promise<AdminActionState> {
  if (!USER_ID.test(targetId)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireAdmin();
    if (targetId === userId) return { ok: false, error: "self" };
    const target = await first<{ role: string }>("SELECT role FROM profiles WHERE id = ?", targetId);
    if (!target) return { ok: false, error: "not_found" };
    if (target.role === "admin") return { ok: false, error: "is_admin" };
    if (suspended) {
      await batch([
        ["UPDATE profiles SET suspended_at = ? WHERE id = ?", nowIso(), targetId],
        ['DELETE FROM "session" WHERE userId = ?', targetId],
        ["UPDATE cleaner_profiles SET status = 'hidden', moderated = 1, updated_at = ? WHERE user_id = ? AND status = 'published'", nowIso(), targetId],
      ]);
    } else {
      await run("UPDATE profiles SET suspended_at = NULL WHERE id = ?", targetId);
    }
    await audit(userId, suspended ? "user_suspended" : "user_restored", targetId);
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
    const { userId } = await requireAdmin();
    const { name, role, city, quote, published } = parsed.data;
    await run("INSERT INTO testimonials (id, name, role, city, quote, consent, published, created_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", uuid(), name, role || null, city || null, quote, published, userId);
    await audit(userId, "testimonial_added", name, { published });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function setTestimonialPublished(id: string, published: boolean): Promise<AdminActionState> {
  if (!UUID.test(id)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireAdmin();
    // publishing needs consent (also enforced by the table's CHECK)
    await run("UPDATE testimonials SET published = ? WHERE id = ? AND (consent = 1 OR ? = 0)", Boolean(published), id, Boolean(published));
    await audit(userId, published ? "testimonial_published" : "testimonial_hidden", id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function deleteTestimonial(id: string): Promise<AdminActionState> {
  if (!UUID.test(id)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireAdmin();
    await run("DELETE FROM testimonials WHERE id = ?", id);
    await audit(userId, "testimonial_deleted", id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
