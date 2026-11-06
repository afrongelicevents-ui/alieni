import { amsterdamInstantFromLocal } from "@/lib/tz";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { computeCleaningSlots, needsReminder, parseIcal } from "@/lib/ical";
import { appBaseUrl, notifyUser, slotCancelledNotice, slotReminderNotice } from "@/lib/notify";
import { isSafeIcalUrl } from "@/lib/url-safety";

/**
 * Calendar sync (brief v2 §6), run daily by the daily bundle (every 30 minutes is possible on Vercel Pro):
 *  1. fetch each unit's iCal feed, create/refresh a cleaning slot per
 *     checkout (idempotent on unit + external UID); a future iCal slot whose
 *     booking is gone from the feed is cancelled and its cleaner told
 *  2. unreserved slots within 48h of checkout: remind host + connected
 *     cleaner(s) once and open the slot to other connected cleaners
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
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
      if (!isSafeIcalUrl(unit.ical_url)) throw new Error("unsupported calendar URL (https on a known provider only)");
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
            starts_at: amsterdamInstantFromLocal(slot.startsAt),
            ends_at: amsterdamInstantFromLocal(slot.endsAt),
          },
          { onConflict: "unit_id,external_uid", ignoreDuplicates: false },
        );
      }
      // bookings that vanished from the feed: cancel their future, not yet done iCal slots (and tell a reserving cleaner)
      const seen = new Set(slots.map((s) => s.externalUid));
      const { data: existing } = await admin.from("cleaning_slots").select("id, external_uid, status, reserved_by, starts_at").eq("unit_id", unit.id).eq("source", "ical").in("status", ["open", "reserved"]).gte("starts_at", new Date().toISOString());
      for (const old of existing ?? []) {
        if (old.external_uid && seen.has(old.external_uid)) continue;
        const { data: cancelled } = await admin.from("cleaning_slots").update({ status: "cancelled" }).eq("id", old.id).in("status", ["open", "reserved"]).select("id").maybeSingle();
        if (cancelled && old.reserved_by) {
          const { data: cp } = await admin.from("cleaner_profiles").select("user_id").eq("id", old.reserved_by).maybeSingle();
          if (cp?.user_id) {
            const when = new Date(old.starts_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "full", timeStyle: "short" });
            const base = await appBaseUrl();
            await notifyUser(cp.user_id, (lang) => slotCancelledNotice(base, when, lang));
          }
        }
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
    const base = await appBaseUrl();
    for (const userId of userIds) {
      await notifyUser(userId, (lang) => slotReminderNotice(base, when, business?.company_name ?? "—", lang));
    }
    reminded++;
  }

  return NextResponse.json({ ok: true, synced, reminded });
}
