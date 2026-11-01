import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATE_FLOOR_CENTS,
  dutchPostcodeSchema,
  isValidHourlyRate,
  makeHourlyRateSchema,
} from "../validation";

describe("hourly rate floor (brief §5: min €15/hour)", () => {
  it("rejects rates below €15/hour", () => {
    expect(isValidHourlyRate(1499)).toBe(false);
    expect(isValidHourlyRate(0)).toBe(false);
    expect(isValidHourlyRate(-100)).toBe(false);
  });

  it("accepts €15/hour and above", () => {
    expect(isValidHourlyRate(1500)).toBe(true);
    expect(isValidHourlyRate(1750)).toBe(true);
  });

  it("honours an admin-configured floor", () => {
    expect(isValidHourlyRate(1500, 1600)).toBe(false);
    expect(isValidHourlyRate(1600, 1600)).toBe(true);
  });

  it("zod schema enforces the floor server-side", () => {
    const schema = makeHourlyRateSchema();
    expect(schema.safeParse(1499).success).toBe(false);
    expect(schema.safeParse(1500).success).toBe(true);
    expect(schema.safeParse(15.5).success).toBe(false); // must be integer cents
    expect(DEFAULT_RATE_FLOOR_CENTS).toBe(1500);
  });
});

describe("dutch postcode", () => {
  it("accepts and normalises valid postcodes", () => {
    expect(dutchPostcodeSchema.parse("1012ab")).toBe("1012 AB");
    expect(dutchPostcodeSchema.parse(" 3511 LX ")).toBe("3511 LX");
  });

  it("rejects invalid postcodes", () => {
    for (const bad of ["0123 AB", "12345", "AB12 CD", "1012", ""]) {
      expect(dutchPostcodeSchema.safeParse(bad).success).toBe(false);
    }
  });
});
