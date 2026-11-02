"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { errorCode, requireUser } from "@/lib/auth";

export type SlotActionState = { ok: boolean; error?: string };

async function myCleanerProfileId(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("cleaner_profiles").select("id").eq("user_id", userId).maybeSingle();
  return data?.id as string | undefined;
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
      .select("id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "taken" };
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
  const file = formData.get("file");
  try {
    const { supabase, userId } = await requireUser();
    const me = await myCleanerProfileId(supabase, userId);
    if (!me) return { ok: false, error: "no_ad" };
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
      .select("id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "not_reserved" };
    revalidatePath("/cleaners/slots");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
