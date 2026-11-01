import { describe, expect, it } from "vitest";
import { isSafeIcalUrl } from "../url-safety";

describe("iCal URL safety (SSRF protection)", () => {
  it("accepts known calendar providers over https", () => {
    expect(isSafeIcalUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc")).toBe(true);
    expect(isSafeIcalUrl("https://ical.booking.com/v1/export?t=xyz")).toBe(true);
    expect(isSafeIcalUrl("https://www.vrbo.com/icalendar/abc.ics")).toBe(true);
    expect(isSafeIcalUrl("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics")).toBe(true);
  });

  it("rejects internal, private and unknown targets", () => {
    for (const bad of [
      "http://www.airbnb.com/calendar/ical/123.ics", // not https
      "https://169.254.169.254/latest/meta-data", // cloud metadata
      "https://127.0.0.1/x.ics",
      "https://[::1]/x.ics",
      "https://localhost/x.ics",
      "https://db.internal/x.ics",
      "https://evil.example.com/airbnb.com/x.ics",
      "https://user:pass@www.airbnb.com/x.ics",
      "not a url",
    ]) {
      expect(isSafeIcalUrl(bad)).toBe(false);
    }
  });
});
