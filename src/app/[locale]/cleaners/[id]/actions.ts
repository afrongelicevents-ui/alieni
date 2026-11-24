"use server";

import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";

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
  const { subjectType, subjectId, reason } = parsed.data;
  try {
    const { userId } = await requireUser();
    if (!(await rateLimit(`report:${userId}`, 10, 60 * 60))) return { ok: false, error: "rate_limit" };
    let details = parsed.data.details || null;
    if (subjectType === "message") {
      // Only the reported message is shared with the admin: it is read here only when the reporter is a member of
      // its conversation, and stored as a snapshot; admins get no access to chats.
      const msg = await first<{ sender_id: string; body: string }>(
        `SELECT m.sender_id, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE m.id = ? AND (c.household_id = ? OR c.cleaner_id = ?)`, subjectId, userId, userId);
      if (!msg) return { ok: false, error: "not_found" };
      if (msg.sender_id === userId) return { ok: false, error: "own_message" };
      details = `[message] ${msg.body.slice(0, 600)}${parsed.data.details ? `\n[note] ${parsed.data.details}` : ""}`.slice(0, 1000);
    } else {
      // the subject must exist and be something the reporter can see
      const visible =
        subjectType === "cleaner_profile"
          ? await first("SELECT 1 AS x FROM cleaner_profiles WHERE id = ? AND (status = 'published' OR user_id = ?)", subjectId, userId)
          : subjectType === "job"
            ? await first("SELECT 1 AS x FROM jobs WHERE id = ? AND status = 'published'", subjectId)
            : await first("SELECT 1 AS x FROM reviews WHERE id = ? AND hidden = 0", subjectId);
      if (!visible) return { ok: false, error: "not_found" };
    }
    await run("INSERT INTO reports (id, reporter_id, subject_type, subject_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      uuid(), userId, subjectType, subjectId, reason, details, nowIso());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
