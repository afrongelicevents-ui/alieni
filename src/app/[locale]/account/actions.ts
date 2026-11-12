"use server";

import { randomBytes } from "node:crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { errorCode, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export type AccountActionState = { ok: boolean; error?: string };

const BUCKETS = ["profile-photos"] as const;

/**
 * Erase the signed-in person's account (AVG right to erasure). The person must type their own e-mail address.
 * Content is removed by erase_user_data(); invoices and payments stay as the law requires, so then the login is
 * disabled and its e-mail address scrambled instead of deleted. Needs the service key.
 */
export async function deleteAccount(confirmEmail: string): Promise<AccountActionState> {
  try {
    const { supabase, userId, email } = await requireUser();
    if (!rateLimit(`delete-account:${userId}`, 5, 60 * 60_000)) return { ok: false, error: "rate_limit" };
    if (!email || confirmEmail.trim().toLowerCase() !== email.toLowerCase()) return { ok: false, error: "email_mismatch" };
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile?.role === "admin") return { ok: false, error: "admin_cannot" };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { ok: false, error: "not_configured" };
    const admin = createSupabaseAdmin(url, key, { auth: { persistSession: false } });

    const { data: result, error } = await admin.rpc("erase_user_data", { p_user: userId });
    if (error) return { ok: false, error: error.code === "PGRST202" || error.code === "42883" ? "db_outdated" : "failed" };

    // files: the profile photo (folders are named after the user id)
    for (const bucket of BUCKETS) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
        if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      } catch {
        // best effort: the database content is already gone
      }
    }

    const keep = (result as { keep_account?: boolean } | null)?.keep_account === true;
    let removed = false;
    if (!keep) {
      const { error: delError } = await admin.auth.admin.deleteUser(userId);
      removed = !delError;
    }
    if (!removed) {
      await admin.auth.admin.updateUserById(userId, {
        email: `deleted+${userId}@alieni.invalid`,
        password: randomBytes(24).toString("hex"),
        ban_duration: "876000h",
        user_metadata: {},
      });
    }
    await supabase.auth.signOut();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
