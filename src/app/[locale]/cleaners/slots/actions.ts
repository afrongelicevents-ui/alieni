"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { errorCode, requireUser } from "@/lib/auth";
import { appBaseUrl, businessOwnerUserId, type Lang, notifyUser, slotCompletedNotice, slotReservedNotice } from "@/lib/notify";

export type SlotActionState = { ok: boolean; error?: string };

async function myCleanerProfileId(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("cleaner_profiles").select("id").eq("user_id", userId).maybeSingle();
  return data?.id as string | undefined;
}

/** Best-effort e-mail to the business owner (a cleaner cannot read the owner's user id under RLS, so the service role resolves it). */
async function notifyBusiness(businessId: string | null, notice: (appUrl: string, lang: Lang) => { subject: string; text: string }) {
  try {
    if (!businessId) return;
    const owner = await businessOwnerUserId(businessId);
    if (!owner) return;
    const base = await appBaseUrl();
    await notifyUser(owner, (lang) => notice(base, lang));
  } catch {
    console.warn("slots: business notification failed");
  }
}

/** Reserve an open turnover slot at a connected business. */
export async function reserveSlot(slotId: string): Promise<SlotActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const me = await myCleanerProfileId(supabase, userId);
    if (!me) return { ok: false, error: "no_ad" };
    const { data, error } = await supabase
      .from("cleaning_slots")
      .update({ status: "reserved", reserved_by: me, reserved_at: new Date().toISOString() })
      .eq("id", slotId)
      .eq("status", "open")
      .select("id, business_id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "taken" };
    await notifyBusiness(data[0].business_id as string | null, slotReservedNotice);
    revalidatePath("/cleaners/slots");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Mark my reserved slot done, with an optional photo (private bucket, EXIF stripped). */
export async function completeSlot(_prev: SlotActionState, formData: FormData): Promise<SlotActionState> {
  const slotId = String(formData.get("slotId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) return { ok: false, error: "invalid" };
  const file = formData.get("file");
  try {
    const { supabase, userId } = await requireUser();
    const me = await myCleanerProfileId(supabase, userId);
    if (!me) return { ok: false, error: "no_ad" };
    // Only my own reserved slot may be completed; check before any upload.
    const { data: slot } = await supabase.from("cleaning_slots").select("id").eq("id", slotId).eq("reserved_by", me).eq("status", "reserved").maybeSingle();
    if (!slot) return { ok: false, error: "not_reserved" };
    let photoPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) return { ok: false, error: "too_large" };
      const webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      photoPath = `${userId}/${slotId}-${Date.now().toString(36)}.webp`;
      const { error: upErr } = await supabase.storage.from("turnover-photos").upload(photoPath, webp, { contentType: "image/webp" });
      if (upErr) return { ok: false, error: "upload_failed" };
    }
    const { data, error } = await supabase
      .from("cleaning_slots")
      .update({ status: "done", reserved_by: me, done_at: new Date().toISOString(), done_photo_path: photoPath })
      .eq("id", slotId)
      .eq("reserved_by", me)
      .eq("status", "reserved")
      .select("id, business_id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "not_reserved" };
    await notifyBusiness(data[0].business_id as string | null, slotCompletedNotice);
    revalidatePath("/cleaners/slots");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Give back a slot I reserved (only before it starts; the database refuses later). */
export async function releaseSlot(slotId: string): Promise<SlotActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const me = await myCleanerProfileId(supabase, userId);
    if (!me) return { ok: false, error: "no_ad" };
    const { data, error } = await supabase
      .from("cleaning_slots")
      .update({ status: "open", reserved_by: null })
      .eq("id", slotId)
      .eq("reserved_by", me)
      .eq("status", "reserved")
      .select("id, business_id");
    if (error) return { ok: false, error: "too_late" };
    if (!data?.length) return { ok: false, error: "taken" };
    revalidatePath("/cleaners/slots");
    revalidatePath("/work");
    revalidatePath("/business/calendar");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
