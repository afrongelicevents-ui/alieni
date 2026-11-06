import { describe, expect, it } from "vitest";
import { amsterdamInstant, amsterdamInstantFromLocal } from "../tz";

describe("amsterdamInstant", () => {
  it("uses +01:00 in winter", () => {
    expect(amsterdamInstant("2026-01-15", "11:00")).toBe("2026-01-15T10:00:00.000Z");
  });
  it("uses +02:00 in summer", () => {
    expect(amsterdamInstant("2026-07-15", "11:00")).toBe("2026-07-15T09:00:00.000Z");
  });
  it("switches on the last Sunday of March and October", () => {
    expect(amsterdamInstant("2026-03-29", "01:30")).toBe("2026-03-29T00:30:00.000Z"); // still winter time
    expect(amsterdamInstant("2026-03-29", "04:00")).toBe("2026-03-29T02:00:00.000Z"); // summer time
    expect(amsterdamInstant("2026-10-25", "04:00")).toBe("2026-10-25T03:00:00.000Z"); // winter time again
  });
  it("accepts a local ISO string", () => {
    expect(amsterdamInstantFromLocal("2026-07-15T11:00:00")).toBe("2026-07-15T09:00:00.000Z");
  });
});
