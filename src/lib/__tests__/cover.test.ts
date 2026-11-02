import { describe, expect, it } from "vitest";
import { cancelDeadline, canReportAttendance, isDateAllowed, isLateCancel, parseCoverRules, strikesRemoveOptIn } from "../cover";

const start = new Date("2026-11-10T14:00:00Z");

describe("cover rules", () => {
  it("parses settings with defaults", () => {
    expect(parseCoverRules(null)).toEqual({ cancelWindowHours: 4, strikeLimit: 2, maxDaysAhead: 14 });
    expect(parseCoverRules({ cancel_window_hours: 6, strike_limit: "x" })).toEqual({ cancelWindowHours: 6, strikeLimit: 2, maxDaysAhead: 14 });
  });
  it("cancel deadline is the window start minus the configured hours", () => {
    expect(cancelDeadline(start).toISOString()).toBe("2026-11-10T10:00:00.000Z");
    expect(isLateCancel(start, new Date("2026-11-10T09:59:00Z"))).toBe(false);
    expect(isLateCancel(start, new Date("2026-11-10T10:01:00Z"))).toBe(true);
    expect(isLateCancel(start, new Date("2026-11-10T13:00:00Z"), { cancelWindowHours: 0, strikeLimit: 2, maxDaysAhead: 14 })).toBe(false);
  });
  it("two strikes remove the opt-in by default, configurable", () => {
    expect(strikesRemoveOptIn(1)).toBe(false);
    expect(strikesRemoveOptIn(2)).toBe(true);
    expect(strikesRemoveOptIn(2, { cancelWindowHours: 4, strikeLimit: 3, maxDaysAhead: 14 })).toBe(false);
  });
  it("cover can be booked today up to 14 days ahead", () => {
    const today = new Date("2026-11-02T18:00:00Z");
    expect(isDateAllowed("2026-11-02", today)).toBe(true);
    expect(isDateAllowed("2026-11-16", today)).toBe(true);
    expect(isDateAllowed("2026-11-17", today)).toBe(false);
    expect(isDateAllowed("2026-11-01", today)).toBe(false);
    expect(isDateAllowed("not-a-date", today)).toBe(false);
  });
  it("attendance is asked only for accepted requests once the shift has started", () => {
    expect(canReportAttendance("accepted", "unknown", start, new Date("2026-11-10T13:00:00Z"))).toBe(false);
    expect(canReportAttendance("accepted", "unknown", start, new Date("2026-11-10T14:00:00Z"))).toBe(true);
    expect(canReportAttendance("accepted", "came", start, new Date("2026-11-11T14:00:00Z"))).toBe(false);
    expect(canReportAttendance("searching", "unknown", start, new Date("2026-11-11T14:00:00Z"))).toBe(false);
  });
});
