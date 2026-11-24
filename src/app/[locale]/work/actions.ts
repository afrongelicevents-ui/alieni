"use server";

import { revalidatePath } from "next/cache";
import { errorCode, requireUser } from "@/lib/auth";
import { first, nowIso, run } from "@/lib/server/db";

export type WorkActionState = { ok: boolean; error?: string };

/** Cleaner marks their own work record started or completed (only records on their own ad). */
export async function progressWork(recordId: string, action: "start" | "complete"): Promise<WorkActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(recordId) || (action !== "start" && action !== "complete")) return { ok: false, error: "invalid" };
  try {
    const { userId, role } = await requireUser();
    if (role !== "cleaner") return { ok: false, error: "not_allowed" };
    const me = await first<{ id: string }>("SELECT id FROM cleaner_profiles WHERE user_id = ?", userId);
    if (!me) return { ok: false, error: "not_found" };
    const now = nowIso();
    const changed = action === "start"
      ? await run("UPDATE work_records SET started_at = coalesce(started_at, ?), updated_at = ? WHERE id = ? AND cleaner_profile_id = ?", now, now, recordId, me.id)
      : await run(`UPDATE work_records SET completed_at = coalesce(completed_at, ?), outcome = CASE WHEN outcome = 'scheduled' THEN 'done' ELSE outcome END, updated_at = ?
                   WHERE id = ? AND cleaner_profile_id = ?`, now, now, recordId, me.id);
    if (!changed) return { ok: false, error: "not_found" };
    revalidatePath("/work");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
