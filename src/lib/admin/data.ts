import "server-only";
import { parseBusinessPricing, toBusinessPricingForm, type BusinessPricingForm } from "@/lib/business-pricing";
import { requireAdmin } from "../auth";
import { all, first, json } from "../server/db";
import { computeKpis, type Kpis } from "./kpis";
import type { AdminBusiness, AdminReport, AdminUser } from "./sample-admin-data";
import { BUSINESS_TYPES, type BusinessType } from "../business";
import { DEFAULT_CATALOG, type CatalogRow } from "../services-shared";

/**
 * Admin data from D1. EVERY reader starts with requireAdmin() (admin role + two-step login): Next.js renders a
 * page in parallel with its layout, so the layout's check alone would not protect the data.
 * Admins never read chat contents: a report only carries the reported message's text, copied into `details`.
 * `demo` stays in the return shapes for the existing components; it is always false now.
 */

export type AdminOverview = { demo: boolean; kpis: Kpis; openReports: number; meetingsThisMonth: number; newAdsThisMonth: number };

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** E-mail and suspension per user id (admin only). */
export async function authInfoByUserId(ids: string[]): Promise<Map<string, { email: string; suspended: boolean }>> {
  await requireAdmin();
  const map = new Map<string, { email: string; suspended: boolean }>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await all<{ id: string; email: string; suspended_at: string | null }>(
      `SELECT u.id, u.email, p.suspended_at FROM "user" u LEFT JOIN profiles p ON p.id = u.id WHERE u.id IN (${placeholders(chunk.length)})`,
      ...chunk,
    );
    for (const r of rows) map.set(r.id, { email: r.email, suspended: Boolean(r.suspended_at) });
  }
  return map;
}

export async function emailsByUserId(ids: string[]): Promise<Map<string, string>> {
  const info = await authInfoByUserId(ids);
  return new Map([...info].filter(([, v]) => v.email).map(([k, v]) => [k, v.email]));
}

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin();
  const since = monthStartIso();
  const connections = await all<{ status: string; ended_at: string | null }>("SELECT status, ended_at FROM connections");
  const counts = await first<{ reports: number; meetings: number; ads: number }>(
    `SELECT (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports,
            (SELECT COUNT(*) FROM meeting_requests WHERE created_at >= ?) AS meetings,
            (SELECT COUNT(*) FROM cleaner_profiles WHERE created_at >= ?) AS ads`,
    since,
    since,
  );
  // Payments are off: there are no payment rows, so revenue is € 0.
  const kpis = computeKpis([], connections.map((c) => ({ status: c.status as "active" | "ended" | "pending", endedAt: c.ended_at })));
  return { demo: false, kpis, openReports: counts?.reports ?? 0, meetingsThisMonth: counts?.meetings ?? 0, newAdsThisMonth: counts?.ads ?? 0 };
}

export async function listReports(): Promise<{ demo: boolean; reports: AdminReport[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; reporter_id: string | null; reporter_name: string | null; subject_type: AdminReport["subjectType"]; subject_id: string; reason: string; details: string | null; status: string; created_at: string; cleaner_name: string | null; job_label: string | null }>(
    `SELECT r.id, r.reporter_id, rp.display_name AS reporter_name, r.subject_type, r.subject_id, r.reason, r.details, r.status, r.created_at,
            (SELECT p.display_name FROM cleaner_profiles c JOIN profiles p ON p.id = c.user_id WHERE r.subject_type = 'cleaner_profile' AND c.id = r.subject_id) AS cleaner_name,
            (SELECT j.space_type || ' · ' || COALESCE(j.city, '') || ' · ' || j.frequency FROM jobs j WHERE r.subject_type = 'job' AND j.id = r.subject_id) AS job_label
       FROM reports r LEFT JOIN profiles rp ON rp.id = r.reporter_id
      ORDER BY r.created_at DESC LIMIT 200`,
  );
  const statusMap: Record<string, AdminReport["status"]> = { open: "open", resolved_hidden: "hidden", resolved_removed: "removed", dismissed: "dismissed" };
  return {
    demo: false,
    reports: rows.map((r) => ({
      id: r.id,
      subject: r.subject_type === "cleaner_profile" ? `Ad: ${r.cleaner_name ?? r.subject_id.slice(0, 8)}` : r.subject_type === "job" ? `Job: ${r.job_label ?? r.subject_id.slice(0, 8)}` : r.subject_type === "message" ? "Message" : r.subject_type === "review" ? "Review" : `${r.subject_type} ${r.subject_id.slice(0, 8)}`,
      subjectType: r.subject_type,
      reason: r.reason,
      details: r.details ?? "",
      reporter: r.reporter_id ? r.reporter_name ?? "—" : "—",
      createdAt: r.created_at,
      status: statusMap[r.status] ?? "open",
    })),
  };
}

export async function listUsers(): Promise<{ demo: boolean; users: AdminUser[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; display_name: string; role: string; city: string | null; created_at: string; email: string | null; suspended_at: string | null }>(
    `SELECT p.id, p.display_name, p.role, p.city, p.created_at, u.email, p.suspended_at
       FROM profiles p LEFT JOIN "user" u ON u.id = p.id ORDER BY p.created_at DESC LIMIT 500`,
  );
  return { demo: false, users: rows.map((r) => ({ id: r.id, name: r.display_name, email: r.email ?? "", role: r.role as AdminUser["role"], city: r.city ?? "", createdAt: r.created_at.slice(0, 10), suspended: Boolean(r.suspended_at) })) };
}

export type AdminAd = { id: string; name: string; city: string; rateCents: number; status: string; verifiedJobs: number; createdAt: string };
export async function listAds(): Promise<{ demo: boolean; ads: AdminAd[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; status: string; rate_cents: number; verified_jobs_count: number; created_at: string; display_name: string | null; city: string | null }>(
    `SELECT c.id, c.status, c.rate_cents, c.verified_jobs_count, c.created_at, p.display_name, p.city
       FROM cleaner_profiles c JOIN profiles p ON p.id = c.user_id ORDER BY c.created_at DESC LIMIT 500`,
  );
  return { demo: false, ads: rows.map((r) => ({ id: r.id, name: r.display_name ?? "—", city: r.city ?? "", rateCents: r.rate_cents, status: r.status, verifiedJobs: r.verified_jobs_count, createdAt: r.created_at.slice(0, 10) })) };
}

export async function listBusinesses(): Promise<{ demo: boolean; businesses: AdminBusiness[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; company_name: string; business_type: string | null; unit_count: number }>(
    "SELECT id, company_name, business_type, unit_count FROM business_profiles ORDER BY created_at DESC LIMIT 500",
  );
  return {
    demo: false,
    businesses: rows.map((b) => {
      const type = (b.business_type && b.business_type in BUSINESS_TYPES ? b.business_type : "office") as BusinessType;
      // Payments are off: nothing is billed, so no monthly amount and no billing status.
      return { id: b.id, company: b.company_name, type, units: b.unit_count, unitPriceCents: 0, billingStartedAt: null, status: "not_started" };
    }),
  };
}

export type SettingsValues = { householdPriceEuro: string; rateFloorEuro: string; bannedWords: string; videoUrl: string; businessPricing: BusinessPricingForm; signupsPaused?: boolean };
const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
export async function getSettings(): Promise<{ demo: boolean; values: SettingsValues | null }> {
  await requireAdmin();
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = new Map(rows.map((r) => [r.key, json<unknown>(r.value, null)]));
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    demo: false,
    values: {
      householdPriceEuro: euro(num(map.get("household_fee_cents"), 0)),
      rateFloorEuro: euro(num(map.get("rate_floor_cents"), 1500)),
      bannedWords: Array.isArray(map.get("banned_words")) ? (map.get("banned_words") as string[]).join(", ") : "",
      videoUrl: typeof map.get("homepage_video_url") === "string" ? (map.get("homepage_video_url") as string) : "",
      businessPricing: toBusinessPricingForm(parseBusinessPricing(map.get("business_pricing"))),
      signupsPaused: map.get("signups_paused") === true,
    },
  };
}

// ========== Catalogue and work ==========
export type AdminWork = { id: string; business: string; cleaner: string; serviceKey: string; scheduledStart: string | null; completedAt: string | null; outcome: string; confirmedAt: string | null; notes: string | null };

export async function listCatalog(): Promise<{ demo: boolean; catalog: CatalogRow[] }> {
  await requireAdmin();
  const rows = await all<{ service_key: string; enabled: number; business_types: string; sort_order: number }>("SELECT service_key, enabled, business_types, sort_order FROM service_catalog ORDER BY sort_order");
  const catalog = rows.map((r) => ({ service_key: r.service_key, enabled: Boolean(r.enabled), business_types: json<string[]>(r.business_types, []), sort_order: r.sort_order })) as CatalogRow[];
  return { demo: false, catalog: catalog.length ? catalog : DEFAULT_CATALOG };
}

export async function listWorkRecords(): Promise<{ demo: boolean; work: AdminWork[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; service_key: string; scheduled_start: string | null; completed_at: string | null; outcome: string; business_confirmed_at: string | null; notes: string | null; company_name: string | null; cleaner_name: string | null }>(
    `SELECT w.id, w.service_key, w.scheduled_start, w.completed_at, w.outcome, w.business_confirmed_at, w.notes, b.company_name, p.display_name AS cleaner_name
       FROM work_records w
       LEFT JOIN business_profiles b ON b.id = w.business_id
       LEFT JOIN cleaner_profiles c ON c.id = w.cleaner_profile_id
       LEFT JOIN profiles p ON p.id = c.user_id
      ORDER BY w.scheduled_start DESC LIMIT 500`,
  );
  return { demo: false, work: rows.map((r) => ({ id: r.id, business: r.company_name ?? "—", cleaner: r.cleaner_name ?? "—", serviceKey: r.service_key, scheduledStart: r.scheduled_start, completedAt: r.completed_at, outcome: r.outcome, confirmedAt: r.business_confirmed_at, notes: r.notes })) };
}

// ========== Website: testimonials ==========
export type AdminTestimonial = { id: string; name: string; role: string | null; city: string | null; quote: string; published: boolean; created_at: string };

export async function listTestimonials(): Promise<{ demo: boolean; items: AdminTestimonial[] }> {
  await requireAdmin();
  const rows = await all<{ id: string; name: string; role: string | null; city: string | null; quote: string; published: number; created_at: string }>(
    "SELECT id, name, role, city, quote, published, created_at FROM testimonials ORDER BY created_at DESC LIMIT 200",
  );
  return { demo: false, items: rows.map((r) => ({ ...r, published: Boolean(r.published) })) };
}
