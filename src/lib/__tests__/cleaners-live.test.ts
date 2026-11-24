import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));

// D1 stand-in: records every SQL statement and answers from fixed rows.
const calls: { sql: string; params: unknown[] }[] = [];
let rows: Record<string, unknown>[] = [];
vi.mock("../server/db", () => ({
  all: async (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); return /availability_slots|reviews/.test(sql) ? [] : rows; },
  first: async (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); return rows[0] ?? null; },
  json: <T,>(v: unknown, fb: T): T => { try { return typeof v === "string" ? JSON.parse(v) : fb; } catch { return fb; } },
}));
vi.mock("../server/files", () => ({ signedFileUrl: async (k: string | null) => (k ? `/api/files/${k}?e=1&s=x` : null) }));

const live = await import("../cleaners-live");

const ad = {
  id: "ad-1", user_id: "u-1", status: "draft", rate_cents: 2000, min_hours: 2, services: '["regular"]', languages: '["nl"]',
  postcode_area: "1012", radius_km: 10, about: "hi", photo_key: "profile/u-1/abcdefgh-1234.webp", verified_jobs_count: 0,
  job_types: '["household"]', work_scope: "household", display_name: "Noor", city: "Amsterdam",
};

beforeEach(() => { calls.length = 0; rows = []; });

describe("cleaner ads on D1", () => {
  it("public lists only read published ads and never the full postcode or exact point", async () => {
    rows = [{ ...ad, status: "published" }];
    const list = await live.fetchLiveCleaners();
    expect(list?.[0].postcode).toBe("1012");
    const sql = calls[0].sql;
    expect(sql).toMatch(/status = 'published'/);
    expect(sql).not.toMatch(/cp\.postcode\b(?!_area)|cp\.lat|cp\.lng/);
  });

  it("a draft ad is only shown to its owner or an admin", async () => {
    rows = [ad];
    expect(await live.fetchOwnCleaner("ad-1", { id: "someone-else", role: "household" })).toBeNull();
    expect((await live.fetchOwnCleaner("ad-1", { id: "u-1", role: "cleaner" }))?.status).toBe("draft");
    expect((await live.fetchOwnCleaner("ad-1", { id: "x", role: "admin" }))?.status).toBe("draft");
  });

  it("distances are measured to a ~1 km grid point, not the home", async () => {
    rows = [{ id: "ad-1", lat: 52.37349, lng: 4.89123 }];
    const d = await live.fetchDistances({ lat: 52.37, lng: 4.89 });
    // snapped to (52.37, 4.89): the same point as the origin
    expect(d?.get("ad-1")).toBe(0);
    expect(live.snap(52.37349)).toBe(52.37);
  });

  it("great-circle distance is right (Amsterdam–Utrecht ≈ 35 km)", () => {
    const km = live.__test.haversineKm({ lat: 52.3676, lng: 4.9041 }, { lat: 52.0907, lng: 5.1214 });
    expect(km).toBeGreaterThan(33);
    expect(km).toBeLessThan(37);
  });
});
