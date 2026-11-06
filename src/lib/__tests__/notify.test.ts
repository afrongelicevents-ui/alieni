import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const n = await import("../notify");
const e = await import("../email");

const URL = "https://alieni.test";
type Mail = { subject: string; text: string };

const cases: [string, (lang: "nl" | "en") => Mail][] = [
  ["newMessageNotice", (l) => n.newMessageNotice(URL, l)],
  ["dealConfirmedNotice", (l) => n.dealConfirmedNotice("Sam", URL, l)],
  ["dealActiveNotice (named)", (l) => n.dealActiveNotice("Sam", URL, l)],
  ["dealActiveNotice (anonymous)", (l) => n.dealActiveNotice("", URL, l)],
  ["quoteReceivedNotice", (l) => n.quoteReceivedNotice(URL, l)],
  ["quoteAcceptedNotice", (l) => n.quoteAcceptedNotice(URL, l)],
  ["quoteDeclinedNotice", (l) => n.quoteDeclinedNotice(URL, l)],
  ["jobCancelledNotice (by business)", (l) => n.jobCancelledNotice(URL, true, l)],
  ["jobCancelledNotice (by cleaner)", (l) => n.jobCancelledNotice(URL, false, l)],
  ["meetingResponseNotice (accepted)", (l) => n.meetingResponseNotice(URL, true, l)],
  ["meetingResponseNotice (declined)", (l) => n.meetingResponseNotice(URL, false, l)],
  ["slotReservedNotice", (l) => n.slotReservedNotice(URL, l)],
  ["slotCompletedNotice", (l) => n.slotCompletedNotice(URL, l)],
  ["vogReviewedNotice (approved)", (l) => n.vogReviewedNotice(URL, true, l)],
  ["vogReviewedNotice (rejected)", (l) => n.vogReviewedNotice(URL, false, l)],
  ["adModeratedNotice (hidden)", (l) => n.adModeratedNotice(URL, "hidden", l)],
  ["adModeratedNotice (removed)", (l) => n.adModeratedNotice(URL, "removed", l)],
  ["connectionEndedNotice (active)", (l) => n.connectionEndedNotice("Sam", URL, true, l)],
  ["connectionEndedNotice (no match)", (l) => n.connectionEndedNotice("", URL, false, l)],
  ["emergencyNearbyNotice", (l) => n.emergencyNearbyNotice(URL, l)],
  ["emergencyAcceptedNotice", (l) => n.emergencyAcceptedNotice(URL, l)],
  ["emergencyCancelledNotice", (l) => n.emergencyCancelledNotice(URL, l)],
  ["meetingProposalNotice", (l) => n.meetingProposalNotice(URL, l)],
  ["meetingProposalAnsweredNotice (accepted)", (l) => n.meetingProposalAnsweredNotice(URL, true, l)],
  ["meetingProposalAnsweredNotice (declined)", (l) => n.meetingProposalAnsweredNotice(URL, false, l)],
  ["meetingWithdrawnNotice", (l) => n.meetingWithdrawnNotice(URL, l)],
  ["meetingRequestEmail", (l) => e.meetingRequestEmail("Sam", l)],
  ["reporterUpdateEmail (hidden)", (l) => e.reporterUpdateEmail("hidden", true, l)],
  ["reporterUpdateEmail (removed)", (l) => e.reporterUpdateEmail("removed", true, l)],
  ["reporterUpdateEmail (dismissed)", (l) => e.reporterUpdateEmail("dismissed", true, l)],
  ["reporterUpdateEmail (no content change)", (l) => e.reporterUpdateEmail("hidden", false, l)],
  ["paymentFailedEmail", (l) => e.paymentFailedEmail(l)],
  ["checkinEmail", (l) => e.checkinEmail(l)],
  [
    "invoiceEmail",
    (l) => e.invoiceEmail({ number: "2026-0001", description: "Test", issuedAt: "2026-01-02T10:00:00Z", netCents: 1000, btwCents: 210, grossCents: 1210 }, l),
  ],
];

const links = (m: Mail) => (m.text.match(/https?:\/\/\S+/g) ?? []).sort();

describe("e-mail builders", () => {
  it.each(cases)("%s: nl and en differ, are complete and share the same link", (_name, build) => {
    const nl = build("nl");
    const en = build("en");
    for (const m of [nl, en]) {
      expect(m.subject.trim()).not.toBe("");
      expect(m.text.trim()).not.toBe("");
      expect(m.subject + m.text).not.toMatch(/\[object|undefined|NaN/);
    }
    expect(en.subject).not.toBe(nl.subject);
    expect(en.text).not.toBe(nl.text);
    expect(links(en)).toEqual(links(nl));
  });

  it("uses the Dutch and English sign-offs", () => {
    expect(n.newMessageNotice(URL, "nl").text).toContain("Groetjes, Alieni · Connect · Clean · Thrive");
    expect(n.newMessageNotice(URL, "en").text).toContain("Cheers, Alieni · Connect · Clean · Thrive");
  });

  it("keeps the Dutch text when no language is given", () => {
    expect(n.newMessageNotice(URL)).toEqual(n.newMessageNotice(URL, "nl"));
    expect(n.quoteReceivedNotice(URL).subject).toBe("Nieuwe offerte voor je klus — Alieni");
    expect(e.paymentFailedEmail().subject).toBe("Actie nodig: betaling mislukt — Alieni");
  });

  it("falls back to nl when the locale cannot be read", async () => {
    // No service role key configured in tests: userLocale must not throw and answers nl.
    await expect(n.userLocale("00000000-0000-0000-0000-000000000000")).resolves.toBe("nl");
  });
});
