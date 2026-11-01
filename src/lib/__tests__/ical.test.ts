import { describe, expect, it } from "vitest";
import { computeCleaningSlots, needsReminder, parseIcal } from "../ical";

const AIRBNB_ICS = `BEGIN:VCALENDAR
PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261123
UID:1@airbnb.com
SUMMARY:Reserved - Jansen
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261123
DTEND;VALUE=DATE:20261126
UID:2@airbnb.com
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261201
DTEND;VALUE=DATE:20261203
UID:3@airbnb.com
SUMMARY:Airbnb (Not available)
END:VEVENT
BEGIN:VEVENT
DTSTART:20261210T150000Z
DTEND:20261212T110000Z
UID:4@booking.com
SUMMARY:Booking.com guest with a very long
  summary that folds onto a second line
END:VEVENT
END:VCALENDAR`;

describe("iCal parsing (Airbnb / Booking.com)", () => {
  it("parses stays, ignores blocked dates, unfolds long lines", () => {
    const bookings = parseIcal(AIRBNB_ICS);
    expect(bookings.map((b) => b.uid)).toEqual(["1@airbnb.com", "2@airbnb.com", "4@booking.com"]);
    expect(bookings[0]).toMatchObject({ start: "2026-11-20", end: "2026-11-23" });
    expect(bookings[2].summary).toContain("folds onto a second line");
  });
});

describe("cleaning slots at every checkout (brief v2 §6)", () => {
  it("creates one slot per checkout, same-day turnover ends at next check-in", () => {
    const slots = computeCleaningSlots(parseIcal(AIRBNB_ICS));
    expect(slots).toHaveLength(3);
    // 23 Nov: guest 1 leaves 11:00, guest 2 arrives same day 15:00
    expect(slots[0]).toEqual({ externalUid: "1@airbnb.com", date: "2026-11-23", startsAt: "2026-11-23T11:00:00", endsAt: "2026-11-23T15:00:00" });
    // 26 Nov: nobody arrives → window until next day's check-in time
    expect(slots[1].startsAt).toBe("2026-11-26T11:00:00");
    expect(slots[1].endsAt).toBe("2026-11-27T15:00:00");
  });

  it("respects custom checkout/check-in times", () => {
    const slots = computeCleaningSlots(parseIcal(AIRBNB_ICS), { checkoutTime: "10:00", checkinTime: "16:00" });
    expect(slots[0].startsAt).toBe("2026-11-23T10:00:00");
    expect(slots[0].endsAt).toBe("2026-11-23T16:00:00");
  });
});

describe("48-hour reminders for unreserved slots", () => {
  const now = new Date("2026-11-21T12:00:00");
  it("reminds for unreserved slots within 48h, once", () => {
    expect(needsReminder({ startsAt: "2026-11-23T11:00:00", reservedBy: null, reminderSentAt: null }, now)).toBe(true);
    expect(needsReminder({ startsAt: "2026-11-23T11:00:00", reservedBy: "cleaner", reminderSentAt: null }, now)).toBe(false);
    expect(needsReminder({ startsAt: "2026-11-23T11:00:00", reservedBy: null, reminderSentAt: "2026-11-21T09:00:00" }, now)).toBe(false);
    expect(needsReminder({ startsAt: "2026-11-26T11:00:00", reservedBy: null, reminderSentAt: null }, now)).toBe(false); // too far
  });
});
