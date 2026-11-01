import { describe, expect, it } from "vitest";
import {
  addBtw,
  BTW_RATE,
  formatEuro,
  formatHourlyRate,
  HOUSEHOLD_FEE_CENTS,
  splitBtw,
} from "../money";

describe("btw (21% VAT) maths", () => {
  it("splits the €14.95 household fee into €12.36 net + €2.59 btw (brief §6)", () => {
    const { netCents, btwCents } = splitBtw(HOUSEHOLD_FEE_CENTS);
    expect(netCents).toBe(1236);
    expect(btwCents).toBe(259);
    expect(netCents + btwCents).toBe(HOUSEHOLD_FEE_CENTS);
  });

  it("net + btw always equals gross for any amount", () => {
    for (const gross of [1, 99, 100, 1495, 9999, 123456]) {
      const { netCents, btwCents } = splitBtw(gross);
      expect(netCents + btwCents).toBe(gross);
    }
  });

  it("adds 21% btw to a net amount", () => {
    expect(addBtw(1000)).toBe(1210);
    expect(BTW_RATE).toBe(0.21);
  });
});

describe("euro formatting", () => {
  it("formats consumer prices with decimals", () => {
    expect(formatEuro(1495, "nl")).toMatch(/14,95/);
    expect(formatEuro(1495, "en")).toMatch(/14\.95/);
  });

  it("formats whole-euro hourly rates without decimals", () => {
    expect(formatHourlyRate(1800, "nl")).not.toMatch(/,00/);
    expect(formatHourlyRate(1750, "nl")).toMatch(/17,50/);
  });
});
