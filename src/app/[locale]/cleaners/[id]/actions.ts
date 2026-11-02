"use server";

import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";

export type ReportState = { ok: boolean; error?: string };

const reportSchema = z.object({
  subjectType: z.enum(["cleaner_profile", "job", "message", "review"]),
  subjectId: z.string().uuid(),
  reason: z.enum(["scam", "inappropriate", "fake", "offensive", "other"]),
  details: z.string().trim().max(1000),
});

/** DSA report (brief §6): stored in `reports`, visible to admin only. */
export async function submitReport(input: z.input<typeof reportSchema>): Promise<ReportState> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "subjectId") ? "sample_subject" : "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("reports").insert({
      reporter_id: userId,
      subject_type: parsed.data.subjectType,
      subject_id: parsed.data.subjectId,
      reason: parsed.data.reason,
      details: parsed.data.details || null,
    });
    if (error) return { ok: false, error: "save_failed" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
