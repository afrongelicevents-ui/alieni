import { describe, expect, it } from "vitest";
import { amsterdamToUtcIso } from "../jobs";

describe("visit times are Amsterdam wall-clock times", () => {
  it("winter time is UTC+1", () => {
    expect(amsterdamToUtcIso("2026-01-15", "09:00")).toBe("2026-01-15T08:00:00.000Z");
  });
  it("summer time is UTC+2", () => {
    expect(amsterdamToUtcIso("2026-07-01", "18:30")).toBe("2026-07-01T16:30:00.000Z");
  });
  it("the day the clocks go forward", () => {
    expect(amsterdamToUtcIso("2026-03-29", "10:00")).toBe("2026-03-29T08:00:00.000Z");
  });
});
