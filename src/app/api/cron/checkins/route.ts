import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { checkinEmail, sendEmail, type Lang } from "@/lib/email";

/**
 * Daily check-in automation (brief §3.10): conversations with 6+ messages
 * that went silent for a week, where no deal was made, get one friendly
 * "Did you find a match?" email to both parties.
 *
 * Triggered by Vercel Cron (vercel.json); protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: candidates, error } = await admin.rpc("checkin_candidates");
  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let sent = 0;
  for (const row of candidates ?? []) {
    // Look up exactly the two parties (listUsers only returns the first page).
    const recipients: { to: string; lang: Lang }[] = [];
    for (const id of [row.household_id, row.cleaner_id] as string[]) {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.email) {
          // Each recipient gets the mail in their own language (profiles.locale, default nl).
          let lang: Lang = "nl";
          try {
            const { data: prof } = await admin.from("profiles").select("locale").eq("id", id).maybeSingle();
            if (prof?.locale === "en") lang = "en";
          } catch {
            // keep nl
          }
          recipients.push({ to: data.user.email, lang });
        }
      } catch {
        console.warn("checkins: e-mail address lookup failed");
      }
    }

    let delivered = 0;
    for (const { to, lang } of recipients) {
      const mail = checkinEmail(lang);
      if (await sendEmail(to, mail.subject, mail.text)) delivered++;
    }
    sent += delivered;

    // Mark only after a successful send; if nothing could be sent the next run retries.
    if (delivered > 0) {
      const { error: markErr } = await admin
        .from("conversations")
        .update({ checkin_sent_at: new Date().toISOString() })
        .eq("id", row.conversation_id)
        .is("checkin_sent_at", null);
      if (markErr) console.warn("checkins: could not mark conversation as sent");
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, emailsSent: sent });
}
