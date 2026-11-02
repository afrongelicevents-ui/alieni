"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { isSiteMediaSlot, SITE_MEDIA_BUCKET, SLOT_SPEC } from "@/lib/site-media";

export type MediaActionState = { ok: boolean; error?: string; slot?: string };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Admin check on top of RLS (RLS is the real guard; this gives a clear error). */
async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: "not_configured" as const };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "not_signed_in" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (profile?.role !== "admin") return { error: "not_admin" as const };
  return { supabase, userId: data.user.id };
}

function revalidateSite() {
  // Home + business landing pages are static; refresh every locale at once.
  revalidatePath("/", "layout");
}

export async function uploadSiteImage(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const slot = String(formData.get("slot") ?? "");
  if (!isSiteMediaSlot(slot)) return { ok: false, error: "bad_slot" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file", slot };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "too_large", slot };
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "bad_type", slot };

  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error, slot };
  const { supabase, userId } = auth;

  // Re-encode server-side: strips metadata, enforces size, normalises to WebP.
  let webp: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const spec = SLOT_SPEC[slot];
    const out = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: spec.maxWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    webp = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch {
    return { ok: false, error: "bad_image", slot };
  }

  const path = `${slot}/${Date.now().toString(36)}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(path, webp, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (uploadError) return { ok: false, error: "upload_failed", slot };

  const { data: previous } = await supabase.from("site_media").select("path").eq("slot", slot).maybeSingle();

  const { error: dbError } = await supabase
    .from("site_media")
    .upsert({ slot, path, width, height, updated_at: new Date().toISOString(), updated_by: userId });
  if (dbError) {
    await supabase.storage.from(SITE_MEDIA_BUCKET).remove([path]);
    return { ok: false, error: "save_failed", slot };
  }

  if (previous?.path && previous.path !== path) {
    await supabase.storage.from(SITE_MEDIA_BUCKET).remove([previous.path]);
  }

  revalidateSite();
  return { ok: true, slot };
}

export async function removeSiteImage(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const slot = String(formData.get("slot") ?? "");
  if (!isSiteMediaSlot(slot)) return { ok: false, error: "bad_slot" };

  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error, slot };
  const { supabase } = auth;

  const { data: row } = await supabase.from("site_media").select("path").eq("slot", slot).maybeSingle();
  const { error } = await supabase.from("site_media").delete().eq("slot", slot);
  if (error) return { ok: false, error: "save_failed", slot };
  if (row?.path) await supabase.storage.from(SITE_MEDIA_BUCKET).remove([row.path]);

  revalidateSite();
  return { ok: true, slot };
}
