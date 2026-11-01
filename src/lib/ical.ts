/**
 * Calendar sync (brief v2 §6): parse Airbnb / Booking.com / VRBO iCal feeds
 * and turn every checkout into a cleaning slot between checkout and the
 * next check-in. Pure functions; the cron fetches feeds every 30 minutes.
 */

export type Booking = {
  uid: string;
  start: string; // YYYY-MM-DD (check-in day)
  end: string; // YYYY-MM-DD (checkout day, exclusive in iCal all-day terms)
  summary: string;
};

/** Unfold RFC 5545 line continuations and split into lines. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function toDate(value: string): string | null {
  // 20261121 or 20261121T150000Z → 2026-11-21
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseIcal(ics: string): Booking[] {
  const bookings: Booking[] = [];
  let current: Partial<Booking> | null = null;
  for (const raw of unfold(ics)) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.uid && current.start && current.end) {
        bookings.push({ uid: current.uid, start: current.start, end: current.end, summary: current.summary ?? "" });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (key === "UID") current.uid = value;
    else if (key === "SUMMARY") current.summary = value;
    else if (key === "DTSTART") current.start = toDate(value) ?? undefined;
    else if (key === "DTEND") current.end = toDate(value) ?? undefined;
  }
  // Airbnb marks blocked dates as "Not available"/"Airbnb (Not available)" — not a stay.
  return bookings
    .filter((b) => !/not available|blocked|unavailable/i.test(b.summary))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export type CleaningSlot = {
  externalUid: string;
  date: string; // checkout day
  startsAt: string; // ISO datetime (local wall-clock, no zone)
  endsAt: string;
};

/**
 * One slot per checkout: from checkout time until the next check-in
 * (same-day turnover) or the default check-in time the next day.
 */
export function computeCleaningSlots(
  bookings: Booking[],
  options: { checkoutTime?: string; checkinTime?: string } = {},
): CleaningSlot[] {
  const checkoutTime = options.checkoutTime ?? "11:00";
  const checkinTime = options.checkinTime ?? "15:00";
  const sorted = [...bookings].sort((a, b) => a.end.localeCompare(b.end));
  return sorted.map((booking) => {
    const next = sorted.find((b) => b.start >= booking.end && b.uid !== booking.uid);
    const sameDayTurnover = next?.start === booking.end;
    const endDate = sameDayTurnover ? booking.end : nextDay(booking.end);
    return {
      externalUid: booking.uid,
      date: booking.end,
      startsAt: `${booking.end}T${checkoutTime}:00`,
      endsAt: `${endDate}T${checkinTime}:00`,
    };
  });
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Slots whose checkout is within `hours` and still unreserved need a reminder. */
export function needsReminder(slot: { startsAt: string; reservedBy: string | null; reminderSentAt: string | null }, now: Date, hours = 48): boolean {
  if (slot.reservedBy || slot.reminderSentAt) return false;
  const start = new Date(slot.startsAt);
  const diffH = (start.getTime() - now.getTime()) / 36e5;
  return diffH > 0 && diffH <= hours;
}
