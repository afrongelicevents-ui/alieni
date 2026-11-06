import { describe, expect, it } from "vitest";
import { acceptRequest, emergencyFeeCents, expireIfDue, minEmergencyRateCents, type EmergencyRequest } from "../emergency";

const base: EmergencyRequest = {
  id: "e1",
  requesterType: "household",
  windowStart: "2026-11-21T14:00:00Z",
  windowEnd: "2026-11-21T18:00:00Z",
  hours: 3,
  status: "searching",
  acceptedBy: null,
  acceptedAt: null,
  feeCents: null,
};
const now = new Date("2026-11-21T10:00:00Z");

describe("emergency acceptance (brief v2 §8)", () => {
  it("first cleaner to accept wins; the second gets nothing", () => {
    const first = acceptRequest(base, "cleaner-a", now);
    expect(first?.status).toBe("accepted");
    expect(first?.acceptedBy).toBe("cleaner-a");
    expect(acceptRequest(first!, "cleaner-b", now)).toBeNull();
  });

  it("records a booking fee only once accepted (0 until a price is set)", () => {
    expect(base.feeCents).toBeNull();
    expect(acceptRequest(base, "c", now)?.feeCents).toBe(0);
    expect(acceptRequest({ ...base, requesterType: "business" }, "c", now)?.feeCents).toBe(0);
    expect(emergencyFeeCents("business", { householdInclBtwCents: 500, businessExclBtwCents: 2000 })).toBe(2000);
  });

  it("cannot accept once the window has started", () => {
    expect(acceptRequest(base, "c", new Date("2026-11-21T14:00:00Z"))).toBeNull();
  });

  it("expires unanswered requests automatically and charges nothing", () => {
    const expired = expireIfDue(base, new Date("2026-11-21T14:01:00Z"));
    expect(expired.status).toBe("expired");
    expect(expired.feeCents).toBeNull();
    expect(expireIfDue(base, now).status).toBe("searching");
    const accepted = acceptRequest(base, "c", now)!;
    expect(expireIfDue(accepted, new Date("2026-11-22T00:00:00Z")).status).toBe("accepted");
  });

  it("enforces the 1.5× emergency rate minimum", () => {
    expect(minEmergencyRateCents(1800)).toBe(2700);
    expect(minEmergencyRateCents(1750)).toBe(2625);
  });
});
