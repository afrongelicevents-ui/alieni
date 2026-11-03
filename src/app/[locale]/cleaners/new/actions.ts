"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { geocodePlace } from "@/lib/geocode";
import { dbErrorCode } from "@/lib/db-errors";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { JOB_TYPE_LABELS, LANGUAGE_LABELS, SERVICE_LABELS } from "@/lib/sample-data";
import { WORK_TYPES } from "@/lib/work-types";

export type AdActionState = { ok: boolean; error?: string; adId?: string; status?: string };

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
  emergencyRateCents: z.number().int().min(0).max(50000),
  rateCents: z.number().int().min(DEFAULT_RATE_FLOOR_CENTS).max(50000),
  minHours: z.number().min(1).max(8),
  postcode: dutchPostcodeSchema,
  radiusKm: z.number().int().min(1).max(100),
  availability: z.array(z.object({ weekday: z.number().int().min(0).max(6), block: z.enum(["morning", "afternoon", "evening"]) })),
  vogIssuedAt: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  publish: z.boolean(),
});
export type AdInput = z.input<typeof adSchema>;

/** Work types stay consistent with the environments and emergency choice (same rule as the migration backfill). */
function deriveWorkTypes(chosen: string[], jobTypes: string[]): string[] {
  const out = new Set(chosen);
  if (jobTypes.includes("emergency")) out.add("emergency_cover");
  if (jobTypes.some((j) => j === "airbnb" || j === "hotel")) out.add("turnover");
  if (jobTypes.some((j) => j === "office" || j === "restaurant" || j === "school")) out.add("commercial_contract");
  return [...out];
}

/** Create or update the signed-in cleaner's ad. RLS limits it to their own row. */
export async function saveCleanerAd(input: AdInput): Promise<AdActionState> {
  const parsed = adSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ad = parsed.data;
  if (ad.jobTypes.includes("emergency") && ad.emergencyRateCents < Math.ceil(ad.rateCents * 1.5)) return { ok: false, error: "emergency_rate" };

  try {
    const { supabase, userId } = await requireUser();

    // Display name + city live on the profile (shown on the ad).
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: ad.name, city: ad.city || null })
      .eq("id", userId);
    if (profileError) return { ok: false, error: "save_failed" };

    const place = await geocodePlace(ad.postcode);
    const point = place ? { lng: place.lng, lat: place.lat } : null;
    if (!ad.city && place?.town) {
      // town derived from the postcode, so a town search can find this cleaner
      await supabase.from("profiles").update({ city: place.town }).eq("id", userId);
    }
    const row = {
      user_id: userId,
      status: ad.publish ? "published" : "draft",
      rate_cents: ad.rateCents,
      min_hours: ad.minHours,
      services: ad.services,
      languages: ad.languages,
      postcode: ad.postcode,
      radius_km: ad.radiusKm,
      location: point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : null,
      about: ad.about || null,
      job_types: ad.jobTypes,
      work_scope: ad.workScope,
      work_types: deriveWorkTypes(ad.workTypes, ad.jobTypes),
      experience_years: ad.experienceYears,
      works_as: ad.worksAs,
      emergency_opt_in: ad.jobTypes.includes("emergency"),
      emergency_rate_cents: ad.jobTypes.includes("emergency") ? ad.emergencyRateCents : null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await supabase
      .from("cleaner_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("id, status")
      .single();
    if (error || !saved) return { ok: false, error: dbErrorCode(error) };

    // Availability: replace the set.
    await supabase.from("availability_slots").delete().eq("cleaner_profile_id", saved.id);
    if (ad.availability.length) {
      const { error: slotError } = await supabase
        .from("availability_slots")
        .insert(ad.availability.map((s) => ({ cleaner_profile_id: saved.id, weekday: s.weekday, block: s.block })));
      if (slotError) return { ok: false, error: "save_failed" };
    }

    // VOG issue date (file upload handled separately; status stays pending until admin review).
    if (ad.jobTypes.includes("school") && ad.vogIssuedAt) {
      await supabase
        .from("vog_documents")
        .upsert({ cleaner_profile_id: saved.id, issued_at: ad.vogIssuedAt }, { onConflict: "cleaner_profile_id", ignoreDuplicates: true });
    }

    revalidatePath("/", "layout");
    return { ok: true, adId: saved.id, status: saved.status };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Upload (and re-encode) the cleaner's profile photo. */
export async function uploadProfilePhoto(_prev: AdActionState, formData: FormData): Promise<AdActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "too_large" };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, error: "bad_type" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: ad } = await supabase.from("cleaner_profiles").select("id, photo_path").eq("user_id", userId).maybeSingle();
    if (!ad) return { ok: false, error: "no_ad" };
    const webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 600, height: 600, fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    const path = `${userId}/${Date.now().toString(36)}.webp`;
    const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, webp, { contentType: "image/webp", cacheControl: "31536000" });
    if (upErr) return { ok: false, error: "upload_failed" };
    const { error: dbErr } = await supabase.from("cleaner_profiles").update({ photo_path: path }).eq("id", ad.id);
    if (dbErr) return { ok: false, error: "save_failed" };
    if (ad.photo_path) await supabase.storage.from("profile-photos").remove([ad.photo_path]);
    revalidatePath("/", "layout");
    return { ok: true, adId: ad.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Upload the VOG file to the private bucket (admin reviews, then the file is deleted). */
export async function uploadVogFile(_prev: AdActionState, formData: FormData): Promise<AdActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "too_large" };
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return { ok: false, error: "bad_type" };
  const issued = String(formData.get("issuedAt") ?? "");
  if (issued && !/^\d{4}-\d{2}-\d{2}$/.test(issued)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: ad } = await supabase.from("cleaner_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!ad) return { ok: false, error: "no_ad" };
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/vog-${Date.now().toString(36)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("vog").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (upErr) return { ok: false, error: "upload_failed" };
    const { error: dbErr } = await supabase
      .from("vog_documents")
      .upsert({ cleaner_profile_id: ad.id, storage_path: path, issued_at: issued || new Date().toISOString().slice(0, 10), status: "pending" }, { onConflict: "cleaner_profile_id" });
    if (dbErr) return { ok: false, error: "save_failed" };
    return { ok: true, adId: ad.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Take the ad offline (status hidden) or back online. */
export async function setAdStatus(status: "published" | "hidden"): Promise<AdActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("cleaner_profiles").update({ status }).eq("user_id", userId);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/", "layout");
    return { ok: true, status };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
