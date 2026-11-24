"use server";

import { revalidatePath } from "next/cache";
import { errorCode, requireAdmin } from "@/lib/auth";
import { first, nowIso, run } from "@/lib/server/db";
import { deleteFile, storeImage } from "@/lib/server/files";
import { isSiteMediaSlot } from "@/lib/site-media";

export type MediaActionState = { ok: boolean; error?: string; slot?: string };

/** Admin (with two-step login) only; anything else gets a clear error code. */
async function admin(): Promise<{ userId: string } | { error: string }> {
  try {
    const { userId } = await requireAdmin();
    return { userId };
  } catch (err) {
    const code = errorCode(err);
    return { error: code === "not_signed_in" ? "not_signed_in" : "not_admin" };
  }
}

/** Admin audit log entry (best effort: never blocks the action). */
async function audit(adminId: string, action: string, subject: string) {
  try {
    await run("INSERT INTO admin_audit_log (admin_id, action, subject) VALUES (?, ?, ?)", adminId, action, subject);
  } catch {
    // logging must not undo a done action
  }
}

function revalidateSite() {
  // Home + business landing pages; refresh every locale at once.
  revalidatePath("/", "layout");
}

/**
 * The browser has already resized the photo to the slot's size and re-encoded it to WebP; the server checks the real
 * type, strips any metadata and stores it in the private R2 bucket under site/<slot>/.
 */
export async function uploadSiteImage(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const slot = String(formData.get("slot") ?? "");
  if (!isSiteMediaSlot(slot)) return { ok: false, error: "bad_slot" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file", slot };

  const auth = await admin();
  if ("error" in auth) return { ok: false, error: auth.error, slot };

  let key: string;
  try {
    key = await storeImage(file, "site", slot);
  } catch (e) {
    const code = errorCode(e);
    return { ok: false, error: code === "file_too_large" ? "too_large" : code === "bad_file_type" ? "bad_type" : code === "bad_file" ? "bad_image" : "upload_failed", slot };
  }

  const previous = await first<{ object_key: string }>("SELECT object_key FROM site_media WHERE slot = ?", slot);
  try {
    await run(
      `INSERT INTO site_media (slot, object_key, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(slot) DO UPDATE SET object_key = excluded.object_key, width = NULL, height = NULL, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      slot, key, nowIso(), auth.userId);
  } catch {
    await deleteFile(key);
    return { ok: false, error: "save_failed", slot };
  }
  if (previous?.object_key && previous.object_key !== key) await deleteFile(previous.object_key);
  await audit(auth.userId, "site_media_uploaded", slot);

  revalidateSite();
  return { ok: true, slot };
}

export async function removeSiteImage(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const slot = String(formData.get("slot") ?? "");
  if (!isSiteMediaSlot(slot)) return { ok: false, error: "bad_slot" };

  const auth = await admin();
  if ("error" in auth) return { ok: false, error: auth.error, slot };

  const row = await first<{ object_key: string }>("SELECT object_key FROM site_media WHERE slot = ?", slot);
  try {
    await run("DELETE FROM site_media WHERE slot = ?", slot);
  } catch {
    return { ok: false, error: "save_failed", slot };
  }
  if (row?.object_key) await deleteFile(row.object_key);
  await audit(auth.userId, "site_media_removed", slot);

  revalidateSite();
  return { ok: true, slot };
}
