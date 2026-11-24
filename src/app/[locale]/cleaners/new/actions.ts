"use server";

import { findBannedWord, getBannedWords, getRateFloorCents } from "@/lib/site-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { batch, bool, first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";
import { deleteFile, storeImage } from "@/lib/server/files";
import { geocodePlace } from "@/lib/geocode";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { JOB_TYPE_LABELS, LANGUAGE_LABELS, SERVICE_LABELS } from "@/lib/sample-data";
import { WORK_TYPES } from "@/lib/work-types";

export type AdActionState = { ok: boolean; error?: string; adId?: string; status?: string; detail?: string; moderated?: boolean };

type OwnAd = { id: string; status: string; moderated: number; photo_key: string | null };

/** The signed-in user's own ad (ownership is the WHERE clause: user_id = the session user). */
async function ownAd(userId: string): Promise<OwnAd | null> {
  return first<OwnAd>("SELECT id, status, moderated, photo_key FROM cleaner_profiles WHERE user_id = ?", userId);
}

/** True when a moderator hid/removed this ad: the owner can then no longer change its status. */
const isModerated = (ad: OwnAd | null) => Boolean(ad && bool(ad.moderated) && (ad.status === "hidden" || ad.status === "removed"));

/** Only cleaners write a cleaner ad. */
async function requireCleaner(): Promise<string> {
  const { userId, role } = await requireUser();
  if (role !== "cleaner") throw new Error("not_allowed");
  return userId;
}

const adSchema = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().max(60),
  about: z.string().trim().max(2000),
  services: z.array(z.enum(Object.keys(SERVICE_LABELS) as [string, ...string[]])).min(1),
  languages: z.array(z.enum(Object.keys(LANGUAGE_LABELS) as [string, ...string[]])).min(1),
  jobTypes: z.array(z.enum(Object.keys(JOB_TYPE_LABELS) as [string, ...string[]])).min(1),
  workScope: z.enum(["household", "commercial", "both"]).default("household"),
  workTypes: z.array(z.enum(WORK_TYPES)).min(1).default(["household_regular"]),
  experienceYears: z.number().int().min(0).max(60).nullable().default(null),
  worksAs: z.enum(["independent", "company"]).nullable().default(null),
  rateCents: z.number().int().min(DEFAULT_RATE_FLOOR_CENTS).max(50000),
  minHours: z.number().min(1).max(8),
  postcode: dutchPostcodeSchema,
  radiusKm: z.number().int().min(1).max(100),
  availability: z.array(z.object({ weekday: z.number().int().min(0).max(6), block: z.enum(["morning", "afternoon", "evening"]) })),
  publish: z.boolean(),
});
export type AdInput = z.input<typeof adSchema>;

/** Work types stay consistent with the environments (same rule as the migration backfill). */
function deriveWorkTypes(chosen: string[], jobTypes: string[]): string[] {
  const out = new Set(chosen);
  if (jobTypes.some((j) => j === "airbnb" || j === "hotel" || j === "office" || j === "restaurant")) out.add("commercial_contract");
  return [...out];
}

/** Create or update the signed-in cleaner's ad. Only their own row (user_id = session user). */
export async function saveCleanerAd(input: AdInput): Promise<AdActionState> {
  const parsed = adSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ad = parsed.data;
  // an ad without availability cannot be contacted (a meeting request needs a slot): drafts may be saved without
  if (ad.publish && ad.availability.length === 0) return { ok: false, error: "no_availability" };
  if (ad.rateCents < Math.max(DEFAULT_RATE_FLOOR_CENTS, await getRateFloorCents())) return { ok: false, error: "rate_floor" };
  if (findBannedWord(`${ad.name} ${ad.about}`, await getBannedWords())) return { ok: false, error: "banned_word" };

  try {
    const userId = await requireCleaner();
    const existing = await ownAd(userId);
    const place = await geocodePlace(ad.postcode);
    const city = ad.city || place?.town || null;
    // a moderated (hidden/removed by an admin) ad keeps its status; 'removed' is never set by the owner
    const status = existing && (isModerated(existing) || existing.status === "removed") ? existing.status : ad.publish ? "published" : "draft";
    const id = existing?.id ?? uuid();
    const now = nowIso();
    const cols = {
      status,
      rate_cents: ad.rateCents,
      min_hours: ad.minHours,
      services: JSON.stringify(ad.services),
      languages: JSON.stringify(ad.languages),
      postcode: ad.postcode,
      postcode_area: ad.postcode.replace(/\s/g, "").slice(0, 4),
      radius_km: ad.radiusKm,
      about: ad.about || null,
      job_types: JSON.stringify(ad.jobTypes),
      work_scope: ad.workScope,
      work_types: JSON.stringify(deriveWorkTypes(ad.workTypes, ad.jobTypes)),
      experience_years: ad.experienceYears,
      works_as: ad.worksAs,
    };
    const statements: [string, ...(string | number | null)[]][] = [
      ["UPDATE profiles SET display_name = ?, city = ? WHERE id = ?", ad.name, city, userId],
    ];
    if (existing) {
      statements.push([
        `UPDATE cleaner_profiles SET status = ?, rate_cents = ?, min_hours = ?, services = ?, languages = ?, postcode = ?, postcode_area = ?,
           radius_km = ?, about = ?, job_types = ?, work_scope = ?, work_types = ?, experience_years = ?, works_as = ?, updated_at = ?
           ${place ? ", lat = ?, lng = ?" : ""}
         WHERE id = ? AND user_id = ?`,
        cols.status, cols.rate_cents, cols.min_hours, cols.services, cols.languages, cols.postcode, cols.postcode_area, cols.radius_km,
        cols.about, cols.job_types, cols.work_scope, cols.work_types, cols.experience_years, cols.works_as, now,
        // a failed lookup must not wipe a stored location
        ...(place ? [place.lat, place.lng] : []), id, userId]);
    } else {
      statements.push([
        `INSERT INTO cleaner_profiles (id, user_id, status, rate_cents, min_hours, services, languages, postcode, postcode_area, radius_km, about,
           job_types, work_scope, work_types, experience_years, works_as, lat, lng, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, userId, cols.status, cols.rate_cents, cols.min_hours, cols.services, cols.languages, cols.postcode, cols.postcode_area, cols.radius_km,
        cols.about, cols.job_types, cols.work_scope, cols.work_types, cols.experience_years, cols.works_as, place?.lat ?? null, place?.lng ?? null, now, now]);
    }
    // Availability: replace the set.
    statements.push(["DELETE FROM availability_slots WHERE cleaner_profile_id = ?", id]);
    const seen = new Set<string>();
    for (const s of ad.availability) {
      const k = `${s.weekday}:${s.block}`;
      if (seen.has(k)) continue;
      seen.add(k);
      statements.push(["INSERT INTO availability_slots (id, cleaner_profile_id, weekday, block) VALUES (?, ?, ?, ?)", uuid(), id, s.weekday, s.block]);
    }
    await batch(statements);

    const saved = await ownAd(userId);
    revalidatePath("/", "layout");
    return { ok: true, adId: id, status: saved?.status ?? status, moderated: isModerated(saved) };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Store the cleaner's profile photo. The browser has already resized it and re-encoded it to WebP (which drops
 * EXIF/GPS); the server checks the real type, strips any metadata left and keeps it in the private R2 bucket.
 */
export async function uploadProfilePhoto(_prev: AdActionState, formData: FormData): Promise<AdActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "too_large" };
  try {
    const userId = await requireCleaner();
    if (!(await rateLimit(`upload:${userId}`, 20, 3600))) return { ok: false, error: "upload_failed" };
    const ad = await ownAd(userId);
    if (!ad) return { ok: false, error: "no_ad" };
    let key: string;
    try {
      key = await storeImage(file, "profile", userId);
    } catch (e) {
      const code = errorCode(e);
      return { ok: false, error: code === "file_too_large" ? "too_large" : code === "bad_file_type" || code === "bad_file" ? "bad_type" : "upload_failed" };
    }
    const changed = await run("UPDATE cleaner_profiles SET photo_key = ?, updated_at = ? WHERE id = ? AND user_id = ?", key, nowIso(), ad.id, userId);
    if (!changed) {
      await deleteFile(key);
      return { ok: false, error: "save_failed" };
    }
    if (ad.photo_key) await deleteFile(ad.photo_key);
    revalidatePath("/", "layout");
    return { ok: true, adId: ad.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Take the ad offline (status hidden) or back online. A moderated ad keeps the status an admin gave it. */
export async function setAdStatus(status: "published" | "hidden"): Promise<AdActionState> {
  if (status !== "published" && status !== "hidden") return { ok: false, error: "invalid" };
  try {
    const userId = await requireCleaner();
    const ad = await ownAd(userId);
    if (!ad) return { ok: false, error: "no_ad" };
    if (!isModerated(ad) && ad.status !== "removed") {
      await run("UPDATE cleaner_profiles SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND moderated = 0", status, nowIso(), ad.id, userId);
    }
    const row = await ownAd(userId);
    revalidatePath("/", "layout");
    return { ok: true, adId: ad.id, status: row?.status ?? ad.status, moderated: isModerated(row) };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
