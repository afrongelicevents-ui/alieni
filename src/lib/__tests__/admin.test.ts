import { describe, expect, it } from "vitest";
import { computeKpis } from "../admin/kpis";
import { SAMPLE_CONNECTIONS, SAMPLE_PAYMENTS } from "../admin/sample-admin-data";
import { toCsv } from "../csv";

describe("admin KPIs (brief §8)", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("sums only paid payments of the current month and splits btw", () => {
    const kpis = computeKpis(SAMPLE_PAYMENTS, SAMPLE_CONNECTIONS, now);
    // 3 × €14.95 paid in November; October payments and pending excluded.
    expect(kpis.revenueGrossCents).toBe(3 * 1495);
    expect(kpis.revenueNetCents + kpis.revenueBtwCents).toBe(kpis.revenueGrossCents);
    expect(kpis.revenueBtwCents).toBe(4485 - Math.round(4485 / 1.21));
  });

  it("counts active connections and churn", () => {
    const kpis = computeKpis(SAMPLE_PAYMENTS, SAMPLE_CONNECTIONS, now);
    expect(kpis.activeConnections).toBe(3);
    expect(kpis.endedThisMonth).toBe(1);
    expect(kpis.churnPct).toBe(25); // 1 ended / (3 active + 1 ended)
  });

  it("handles an empty platform", () => {
    const kpis = computeKpis([], [], now);
    expect(kpis.revenueGrossCents).toBe(0);
    expect(kpis.churnPct).toBe(0);
  });
});

describe("csv export", () => {
  it("builds semicolon-separated csv with quoting", () => {
    const csv = toCsv([
      { factuur: "ALI-2026-0001", klant: 'Jansen; "De Grote"', bedrag: 14.95 },
      { factuur: "ALI-2026-0002", klant: "De Vries", bedrag: 14.95 },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("factuur;klant;bedrag");
    expect(lines[1]).toBe('ALI-2026-0001;"Jansen; ""De Grote""";14.95');
    expect(lines[2]).toBe("ALI-2026-0002;De Vries;14.95");
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
