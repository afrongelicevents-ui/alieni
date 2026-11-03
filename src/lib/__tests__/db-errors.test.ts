import { describe, expect, it } from "vitest";
import { dbErrorCode } from "../db-errors";

describe("dbErrorCode", () => {
  it("recognises a database that is behind the code", () => {
    expect(dbErrorCode({ code: "42703", message: 'column "unit_id" of relation "emergency_requests" does not exist' })).toBe("db_outdated");
    expect(dbErrorCode({ code: "PGRST204", message: "Could not find the 'report_to' column of 'emergency_requests' in the schema cache" })).toBe("db_outdated");
    expect(dbErrorCode({ code: "42883", message: "function cleaner_distances(double precision, double precision) does not exist" })).toBe("db_outdated");
  });
  it("keeps rate limits and falls back otherwise", () => {
    expect(dbErrorCode({ code: "P0001", message: "emergency request limit reached (3 per day)" })).toBe("rate_limit");
    expect(dbErrorCode({ code: "23505", message: "duplicate key" })).toBe("save_failed");
    expect(dbErrorCode(null, "x")).toBe("x");
  });
});
