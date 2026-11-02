"use server";

import { revalidatePath } from "next/cache";
import { errorCode, requireUser } from "@/lib/auth";

export type WorkActionState = { ok: boolean; error?: string };

/** Cleaner marks their own work record started or completed (database function checks ownership). */
export async function progressWork(recordId: string, action: "start" | "complete"): Promise<WorkActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(recordId) || (action !== "start" && action !== "complete")) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("progress_work_record", { p_record_id: recordId, p_action: action });
    if (error) return { ok: false, error: "save_failed" };
    if (!data) return { ok: false, error: "not_found" };
    revalidatePath("/work");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
