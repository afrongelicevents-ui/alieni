import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

/**
 * Daily check-in automation (brief §3.10): conversations with 6+ messages
 * that went silent for a week, where no deal was made, get one friendly
 * "Did you find a match?" email to both parties.
 *
 * Triggered by Vercel Cron (vercel.json); protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
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
    // Mark first (idempotency): if the email fails, the next run may retry
    // only rows that are still unmarked — never double-send.
    const { data: marked } = await admin
      .from("conversations")
      .update({ checkin_sent_at: new Date().toISOString() })
      .eq("id", row.conversation_id)
      .is("checkin_sent_at", null)
      .select()
      .maybeSingle();
    if (!marked) continue;

    const { data: users } = await admin.auth.admin.listUsers();
    const recipients = (users?.users ?? [])
      .filter((u) => u.id === row.household_id || u.id === row.cleaner_id)
      .map((u) => u.email)
      .filter((e): e is string => Boolean(e));

    for (const to of recipients) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Alieni <no-reply@alieni.nl>",
          to,
          subject: "Hebben jullie een match gevonden? — Alieni",
          text: [
            "Hoi!",
            "",
            "Jullie hadden een leuk gesprek op Alieni, maar het is even stil.",
            "Hebben jullie een match gevonden? Bevestig het dan in de app —",
            "pas daarna start het abonnement en zijn contactgegevens zichtbaar.",
            "Nog niet de juiste klik? Er staan genoeg andere profielen voor je klaar.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
        }),
      });
      sent++;
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, emailsSent: sent });
}
