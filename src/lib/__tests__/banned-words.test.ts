import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { findBannedWord } = await import("../site-settings");

describe("findBannedWord", () => {
  it("finds a whole word, ignoring case", () => {
    expect(findBannedWord("This is a Scam!", ["scam"])).toBe("scam");
  });
  it("does not match inside another word", () => {
    expect(findBannedWord("Scampi for dinner", ["scam"])).toBeNull();
  });
  it("returns null with an empty list", () => {
    expect(findBannedWord("anything", [])).toBeNull();
  });
  it("handles regex characters in a word", () => {
    expect(findBannedWord("pay now (cash)", ["(cash)"])).toBe("(cash)");
    expect(findBannedWord("a c++ job", ["c++"])).toBe("c++");
  });
});
