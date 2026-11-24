"use server";

import { errorCode, requireUser } from "@/lib/auth";
import { batch, first, rateLimit } from "@/lib/server/db";
import { deleteFile } from "@/lib/server/files";

export type AccountActionState = { ok: boolean; error?: string };

/**
 * Erase the signed-in person's account (AVG right to erasure). The person must type their own e-mail address.
 * Only ever acts on the signed-in user (no id from the browser). Removes their content (as erase_user_data did on
 * alieni-nl), their photos in R2, and finally the login itself (sessions, password and 2FA rows go with it).
 * Payments are off, so there are no invoices that would have to be kept.
 */
export async function deleteAccount(confirmEmail: string): Promise<AccountActionState> {
  try {
    const { userId, email, role } = await requireUser();
    if (!(await rateLimit(`delete-account:${userId}`, 5, 60 * 60))) return { ok: false, error: "rate_limit" };
    if (!email || confirmEmail.trim().toLowerCase() !== email.toLowerCase()) return { ok: false, error: "email_mismatch" };
    if (role === "admin") return { ok: false, error: "admin_cannot" };

    const cleaner = await first<{ id: string; photo_key: string | null }>("SELECT id, photo_key FROM cleaner_profiles WHERE user_id = ?", userId);
    const business = await first<{ id: string }>("SELECT id FROM business_profiles WHERE user_id = ?", userId);
    const cleanerId = cleaner?.id ?? "";
    const businessId = business?.id ?? "";

    // One transaction: everything goes, or nothing does.
    await batch([
      ["DELETE FROM favourites WHERE user_id = ?", userId],
      ["DELETE FROM meeting_requests WHERE household_id = ? OR cleaner_profile_id = ?", userId, cleanerId],
      ["DELETE FROM conversations WHERE household_id = ? OR cleaner_id = ?", userId, userId],
      ["DELETE FROM connections WHERE household_id = ? OR cleaner_id = ?", userId, userId],
      ["DELETE FROM reviews WHERE author_id = ? OR subject_id = ?", userId, userId],
      ["DELETE FROM work_records WHERE household_id = ? OR business_id = ? OR cleaner_profile_id = ?", userId, businessId, cleanerId],
      ["DELETE FROM job_responses WHERE cleaner_profile_id = ?", cleanerId],
      ["DELETE FROM jobs WHERE business_id = ?", businessId],
      ["DELETE FROM business_units WHERE business_id = ?", businessId],
      ["DELETE FROM business_profiles WHERE user_id = ?", userId],
      ["DELETE FROM availability_slots WHERE cleaner_profile_id = ?", cleanerId],
      ["DELETE FROM cleaner_profiles WHERE user_id = ?", userId],
      ["DELETE FROM household_profiles WHERE user_id = ?", userId],
      ["UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?", userId],
      ["DELETE FROM profiles WHERE id = ?", userId],
      // the login: sessions, accounts (password) and 2FA rows are removed by ON DELETE CASCADE
      ['DELETE FROM "user" WHERE id = ?', userId],
    ]);

    // Files: best effort after the database is clean (an orphaned file is unreachable without a signed link).
    await deleteFile(cleaner?.photo_key).catch(() => null);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

