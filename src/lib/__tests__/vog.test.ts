import { describe, expect, it } from "vitest";
import { isVogValid, parseFilters, searchCleaners } from "../cleaners";

const now = new Date("2026-11-15T12:00:00Z");

describe("VOG visibility rules (brief v2 §7)", () => {
  it("only approved VOGs within the max age are valid", () => {
    expect(isVogValid({ status: "approved", issuedAt: "2026-06-12" }, now)).toBe(true);
    expect(isVogValid({ status: "approved", issuedAt: "2025-03-01" }, now)).toBe(false); // older than 12 months
    expect(isVogValid({ status: "pending", issuedAt: "2026-10-01" }, now)).toBe(false);
    expect(isVogValid({ status: "rejected", issuedAt: "2026-10-01" }, now)).toBe(false);
    expect(isVogValid(undefined, now)).toBe(false);
  });

  it("honours the admin max-age setting", () => {
    expect(isVogValid({ status: "approved", issuedAt: "2025-03-01" }, now, 24)).toBe(true);
  });

  it("school searches show only VOG-approved cleaners", () => {
    const results = searchCleaners({ jobType: "school" }, { now });
    expect(results.map((c) => c.id)).toEqual(["sample-3"]);
  });

  it("other business types filter by accepted job type without VOG", () => {
    const results = searchCleaners({ jobType: "airbnb" }, { now });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.jobTypes.includes("airbnb"))).toBe(true);
  });

  it("parses jobType from the URL and drops unknown values", () => {
    expect(parseFilters({ jobType: "school" }).jobType).toBe("school");
    expect(parseFilters({ jobType: "nonsense" }).jobType).toBeUndefined();
  });
});
