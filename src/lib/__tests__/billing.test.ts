import { describe, expect, it } from "vitest";
import { applyPendingUnits, connectionStatusFor, isLastDayOfMonthAmsterdam, paymentTransition } from "../billing";

describe("SEPA payment transitions (brief v2 §11)", () => {
  it("activates on paid", () => {
    expect(paymentTransition({ status: "paid" })).toBe("paid");
    expect(connectionStatusFor("paid")).toBe("active");
  });

  it("pauses the connection on a failed or expired direct debit", () => {
    for (const status of ["failed", "canceled", "expired"] as const) {
      const t = paymentTransition({ status });
      expect(t).toBe("failed");
      expect(connectionStatusFor(t)).toBe("paused");
    }
  });

  it("treats a chargeback (reversal) after payment as a pause", () => {
    const t = paymentTransition({ status: "paid", amountChargedBack: { value: "14.95" } });
    expect(t).toBe("reversed");
    expect(connectionStatusFor(t)).toBe("paused");
  });

  it("leaves pending payments alone", () => {
    expect(paymentTransition({ status: "pending" })).toBe("pending");
    expect(connectionStatusFor("pending")).toBeNull();
  });
});

describe("unit-count changes apply next month", () => {
  it("bills the old count this month and switches afterwards", () => {
    expect(applyPendingUnits(11, 14)).toEqual({ billNow: 11, afterBilling: 14 });
    expect(applyPendingUnits(11, null)).toEqual({ billNow: 11, afterBilling: 11 });
  });
});

describe("month-end detection in Europe/Amsterdam", () => {
  it("recognises the last day of the month in local time", () => {
    expect(isLastDayOfMonthAmsterdam(new Date("2026-11-30T12:00:00Z"))).toBe(true);
    expect(isLastDayOfMonthAmsterdam(new Date("2026-11-29T12:00:00Z"))).toBe(false);
    // 30 Nov 23:30 UTC is already 1 Dec 00:30 in Amsterdam
    expect(isLastDayOfMonthAmsterdam(new Date("2026-11-30T23:30:00Z"))).toBe(false);
    expect(isLastDayOfMonthAmsterdam(new Date("2028-02-29T12:00:00Z"))).toBe(true);
  });
});
