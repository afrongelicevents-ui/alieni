import { describe, expect, it } from "vitest";
import { BUSINESS_TYPE_KEYS, computeBillingPeriod, daysInMonth, monthlyFee } from "../business";

describe("business monthly fee (fixed fee per unit, excl. BTW)", () => {
  it("multiplies units by the unit price and adds 21% BTW underneath", () => {
    const fee = monthlyFee("airbnb", 11);
    expect(fee.netCents).toBe(11 * 1500); // "11 listings × €15 = €165"
    expect(fee.grossCents).toBe(Math.round(16500 * 1.21));
    expect(fee.netCents + fee.btwCents).toBe(fee.grossCents);
  });

  it("works for every business type with custom admin prices", () => {
    const prices = { airbnb: 1000, hotel: 250, restaurant: 5000, office: 4500, school: 12000 };
    for (const type of BUSINESS_TYPE_KEYS) {
      expect(monthlyFee(type, 3, prices).netCents).toBe(3 * prices[type]);
    }
  });

  it("rejects invalid unit counts", () => {
    expect(() => monthlyFee("hotel", 0)).toThrow();
    expect(() => monthlyFee("hotel", 1.5)).toThrow();
  });
});

describe("month-end billing periods (direct debit in arrears)", () => {
  it("bills a full month when billing started before the month", () => {
    const p = computeBillingPeriod({
      billingStartedAt: new Date("2026-10-05T10:00:00Z"),
      now: new Date("2026-11-30T12:00:00Z"),
      unitCount: 4,
      unitPriceCents: 4900,
    })!;
    expect(p.periodStart).toBe("2026-11-01");
    expect(p.periodEnd).toBe("2026-11-30");
    expect(p.billableDays).toBe(30);
    expect(p.netCents).toBe(4 * 4900);
  });

  it("pro-rates the first month from the deal day", () => {
    const p = computeBillingPeriod({
      billingStartedAt: new Date("2026-11-21T09:00:00Z"),
      now: new Date("2026-11-30T23:00:00Z"),
      unitCount: 10,
      unitPriceCents: 1500, // €150 full month
    })!;
    expect(p.periodStart).toBe("2026-11-21");
    expect(p.billableDays).toBe(10); // 21..30 inclusive
    expect(p.netCents).toBe(Math.round((15000 * 10) / 30)); // €50
    expect(p.netCents + p.btwCents).toBe(p.grossCents);
  });

  it("returns null when billing has not started yet", () => {
    expect(
      computeBillingPeriod({
        billingStartedAt: new Date("2026-12-02T00:00:00Z"),
        now: new Date("2026-11-30T00:00:00Z"),
        unitCount: 1,
        unitPriceCents: 300,
      }),
    ).toBeNull();
  });

  it("handles February and leap years", () => {
    expect(daysInMonth(new Date("2028-02-10T00:00:00Z"))).toBe(29);
    expect(daysInMonth(new Date("2027-02-10T00:00:00Z"))).toBe(28);
  });
});
