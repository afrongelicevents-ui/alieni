import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { all, nowIso, run } from "@/lib/server/db";
import { checkinEmail, sendEmail, type Lang } from "@/lib/email";

/**
 * Daily check-in automation (brief §3.10): conversations with 6+ messages that went silent for a week, where no
 * deal was made, get one friendly "Did you find a match?" e-mail to both parties.
 *
 * Triggered by the Worker's daily cron (worker.ts → /api/cron/daily); protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const candidates = await all<{ conversation_id: string; household_id: string; cleaner_id: string }>(
    `SELECT c.id AS conversation_id, c.household_id, c.cleaner_id FROM conversations c
      WHERE c.checkin_sent_at IS NULL AND c.last_message_at < ?
        AND (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) >= 6
        AND NOT EXISTS (SELECT 1 FROM connections x WHERE x.household_id = c.household_id AND x.cleaner_id = c.cleaner_id)
      LIMIT 200`, weekAgo);

  let sent = 0;
  for (const row of candidates) {
    // exactly the two parties, each in their own language (profiles.locale, default nl)
    const people = await all<{ email: string; locale: string | null }>(
      `SELECT u.email, p.locale FROM "user" u JOIN profiles p ON p.id = u.id
        WHERE u.id IN (?, ?) AND p.suspended_at IS NULL`, row.household_id, row.cleaner_id);
    let delivered = 0;
    for (const { email, locale } of people) {
      const lang: Lang = locale === "en" ? "en" : "nl";
      const mail = checkinEmail(lang);
      if (await sendEmail(email, mail.subject, mail.text)) delivered++;
    }
    sent += delivered;
    // Mark only after a successful send; if nothing could be sent the next run retries.
    if (delivered > 0) {
      await run("UPDATE conversations SET checkin_sent_at = ? WHERE id = ? AND checkin_sent_at IS NULL", nowIso(), row.conversation_id);
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, emailsSent: sent });
}
