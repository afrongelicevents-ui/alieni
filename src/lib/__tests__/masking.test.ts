import { describe, expect, it } from "vitest";
import { maskContacts, MASK_PLACEHOLDER } from "../masking";

const masked = (s: string) => maskContacts(s, "[X]");

describe("contact masking (brief §3.6)", () => {
  describe("phone numbers", () => {
    const cases = [
      "bel me op 0612345678",
      "bel me op 06 12 34 56 78",
      "bel me op 06-12345678",
      "bel me op 06.1234.5678",
      "bel me op +31612345678",
      "bel me op +31 6 1234 5678",
      "bel me op 0031612345678",
      "mijn vaste lijn is 020-1234567",
      "call me at (020) 123 45 67",
    ];
    for (const text of cases) {
      it(`masks "${text}"`, () => {
        const result = masked(text);
        expect(result.masked).toBe(true);
        expect(result.text).not.toMatch(/\d{4}/);
      });
    }

    it("leaves prices and small numbers alone", () => {
      for (const text of ["€ 17,50 per uur", "3 uur per week", "om 10:30 uur", "postcode 1012"]) {
        const result = masked(text);
        expect(result.masked).toBe(false);
        expect(result.text).toBe(text);
      }
    });
  });

  describe("emails", () => {
    const cases = [
      "mail me: sandra@example.com",
      "sandra.m+klant@sub.domein.nl",
      "sandra (at) voorbeeld.nl",
      "sandra[at]voorbeeld.nl",
    ];
    for (const text of cases) {
      it(`masks "${text}"`, () => {
        const result = masked(text);
        expect(result.masked).toBe(true);
        expect(result.text).not.toContain("sandra@");
        expect(result.text).not.toContain("voorbeeld.nl");
      });
    }
  });

  describe("urls and whatsapp links", () => {
    const cases = [
      "kijk op https://mijnsite.nl/profiel",
      "kijk op www.mijnsite.nl",
      "app me via wa.me/31612345678",
      "mijn site is mijnsite.com",
      "stuur een berichtje op t.me/sandra",
    ];
    for (const text of cases) {
      it(`masks "${text}"`, () => {
        const result = masked(text);
        expect(result.masked).toBe(true);
        expect(result.text).not.toMatch(/mijnsite|wa\.me|t\.me/);
      });
    }
  });

  it("masks multiple contacts in one message", () => {
    const result = masked("Bel 0612345678 of mail sandra@example.com of kijk op www.site.nl");
    expect(result.masked).toBe(true);
    expect(result.text).toBe("Bel [X] of mail [X] of kijk op [X]");
  });

  it("does not mask ordinary chat", () => {
    const texts = [
      "Hoi! Kun je donderdagochtend om 9 uur?",
      "Ik vraag € 18 per uur, minimaal 3 uur.",
      "Tot volgende week, groetjes Sandra",
      "De deal is rond, top!",
    ];
    for (const text of texts) {
      const result = masked(text);
      expect(result.masked).toBe(false);
      expect(result.text).toBe(text);
    }
  });

  it("uses the default placeholder when none is given", () => {
    const result = maskContacts("bel 0612345678");
    expect(result.text).toContain(MASK_PLACEHOLDER);
  });
});
