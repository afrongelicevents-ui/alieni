import { describe, expect, it } from "vitest";
import { buildInvoice, formatInvoiceNumber } from "../invoices";

describe("invoices (brief §6)", () => {
  it("formats sequential invoice numbers", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("ALI-2026-0001");
    expect(formatInvoiceNumber(2026, 123)).toBe("ALI-2026-0123");
    expect(formatInvoiceNumber(2027, 10001)).toBe("ALI-2027-10001");
  });

  it("builds an invoice with the exact btw split of the amount charged", () => {
    const invoice = buildInvoice({ seq: 1, grossCents: 1495, issuedAt: new Date("2026-11-01"), description: "Alieni verbinding november" });
    expect(invoice.number).toBe("ALI-2026-0001");
    expect(invoice.grossCents).toBe(1495);
    expect(invoice.netCents).toBe(1236);
    expect(invoice.btwCents).toBe(259);
  });

  it("net + btw always equals gross", () => {
    for (const gross of [1495, 999, 2500]) {
      const inv = buildInvoice({ seq: 2, grossCents: gross, description: "x" });
      expect(inv.netCents + inv.btwCents).toBe(inv.grossCents);
    }
  });
});
