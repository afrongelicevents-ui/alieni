import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { computeCleaningSlots, needsReminder, parseIcal } from "@/lib/ical";
import { sendEmail } from "@/lib/email";

/**
 * Calendar sync (brief v2 §6), every 30 minutes (Vercel Pro cron):
 *  1. fetch each unit's iCal feed, create/refresh a cleaning slot per
 *     checkout (idempotent on unit + external UID)
 *  2. unreserved slots within 48h of checkout: remind host + connected
 *     cleaner(s) once and open the slot to other connected cleaners
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Sync feeds
  const { data: units } = await admin
    .from("business_units")
    .select("id, business_id, ical_url, checkout_time, checkin_time")
    .not("ical_url", "is", null);

  let synced = 0;
  for (const unit of units ?? []) {
    try {
      const res = await fetch(unit.ical_url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "text/calendar" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bookings = parseIcal(await res.text());
      const slots = computeCleaningSlots(bookings, {
        checkoutTime: String(unit.checkout_time).slice(0, 5),
        checkinTime: String(unit.checkin_time).slice(0, 5),
      });
      for (const slot of slots) {
        // Only future checkouts; existing reserved/done slots keep their state.
        if (slot.date < new Date().toISOString().slice(0, 10)) continue;
        await admin.from("cleaning_slots").upsert(
          {
            unit_id: unit.id,
            business_id: unit.business_id,
            source: "ical",
            external_uid: slot.externalUid,
            slot_date: slot.date,
            starts_at: `${slot.startsAt}+01:00`,
            ends_at: `${slot.endsAt}+01:00`,
          },
          { onConflict: "unit_id,external_uid", ignoreDuplicates: false },
        );
      }
      await admin.from("business_units").update({ ical_last_synced_at: new Date().toISOString(), ical_last_error: null }).eq("id", unit.id);
      synced++;
    } catch (err) {
      await admin.from("business_units").update({ ical_last_error: String(err).slice(0, 200) }).eq("id", unit.id);
    }
  }

  // 2. 48h reminders for unreserved slots
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 36e5).toISOString();
  const { data: due } = await admin
    .from("cleaning_slots")
    .select("id, business_id, unit_id, starts_at, reserved_by, reminder_sent_at")
    .eq("status", "open")
    .is("reminder_sent_at", null)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon);

  let reminded = 0;
  for (const slot of due ?? []) {
    if (!needsReminder({ startsAt: slot.starts_at, reservedBy: slot.reserved_by, reminderSentAt: slot.reminder_sent_at }, now)) continue;
    const { data: marked } = await admin
      .from("cleaning_slots")
      .update({ reminder_sent_at: now.toISOString(), offered_to_others_at: now.toISOString() })
      .eq("id", slot.id)
      .is("reminder_sent_at", null)
      .select()
      .maybeSingle();
    if (!marked) continue;

    // Host + every connected cleaner of this business
    const { data: business } = await admin.from("business_profiles").select("user_id, company_name").eq("id", slot.business_id).single();
    const { data: conns } = await admin.from("connections").select("cleaner_id").eq("household_id", business?.user_id ?? "").eq("status", "active");
    const userIds = [business?.user_id, ...(conns ?? []).map((c) => c.cleaner_id)].filter((x): x is string => Boolean(x));
    const when = new Date(slot.starts_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "full", timeStyle: "short" });
    for (const userId of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      if (u?.user?.email) {
        await sendEmail(
          u.user.email,
          `Schoonmaak nog niet gereserveerd — ${when}`,
          [
            "Hoi,",
            "",
            `Er staat binnen 48 uur een checkout-schoonmaak gepland (${when}) bij ${business?.company_name ?? "jouw locatie"} die nog niet is gereserveerd.`,
            "Reserveer hem in de app, of de klus wordt aangeboden aan andere gekoppelde schoonmakers.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
        );
      }
    }
    reminded++;
  }

  return NextResponse.json({ ok: true, synced, reminded });
}
