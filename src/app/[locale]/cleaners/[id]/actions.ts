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
    let details = parsed.data.details || null;
    if (parsed.data.subjectType === "message") {
      // Only the reported message is shared with the admin: it is read here as a member of the conversation
      // (the access rules refuse anyone else) and stored as a snapshot; admins get no access to chats.
      const { data: msg } = await supabase.from("messages").select("sender_id, body").eq("id", parsed.data.subjectId).maybeSingle<{ sender_id: string; body: string }>();
      if (!msg) return { ok: false, error: "not_found" };
      if (msg.sender_id === userId) return { ok: false, error: "own_message" };
      details = `[message] ${msg.body.slice(0, 600)}${parsed.data.details ? `\n[note] ${parsed.data.details}` : ""}`.slice(0, 1000);
    }
    const { error } = await supabase.from("reports").insert({
      reporter_id: userId,
      subject_type: parsed.data.subjectType,
      subject_id: parsed.data.subjectId,
      reason: parsed.data.reason,
      details,
    });
    if (error) return { ok: false, error: "save_failed" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
