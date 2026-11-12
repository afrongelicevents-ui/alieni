import "server-only";
import { parseBusinessPricing, toBusinessPricingForm, type BusinessPricingForm } from "@/lib/business-pricing";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { computeKpis, type Kpis } from "./kpis";
import { SAMPLE_BUSINESSES, SAMPLE_CONNECTIONS, SAMPLE_COUNTS, SAMPLE_PAYMENTS, SAMPLE_REPORTS, SAMPLE_USERS, type AdminBusiness, type AdminPayment, type AdminReport, type AdminUser } from "./sample-admin-data";
import { SAMPLE_CLEANERS } from "../sample-data";
import { BUSINESS_TYPES, type BusinessType } from "../business";
import { DEFAULT_CATALOG, getActiveRules, monthlyUnitPrices, type CatalogRow, type PricingRule } from "../services";

/**
 * Admin data. Runs with the admin's own session (RLS admin policies).
 * Without Supabase the labelled sample data is returned (demo mode).
 */

export type AdminOverview = { demo: boolean; kpis: Kpis; openReports: number; meetingsThisMonth: number; newAdsThisMonth: number };

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** E-mail and suspension per user id, when the service role key is configured (auth.users is not readable otherwise). */
export async function authInfoByUserId(ids: string[]): Promise<Map<string, { email: string; suspended: boolean }>> {
  const map = new Map<string, { email: string; suspended: boolean }>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || ids.length === 0) return map;
  try {
    const admin = createSupabaseAdmin(url, key, { auth: { persistSession: false } });
    const wanted = new Set(ids);
    const perPage = 1000;
    // Page through all users until a short page (the default call only returns the first page).
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        if (!wanted.has(u.id)) continue;
        const until = (u as { banned_until?: string | null }).banned_until;
        map.set(u.id, { email: u.email ?? "", suspended: Boolean(until && new Date(until).getTime() > Date.now()) });
      }
      if (users.length < perPage || map.size >= wanted.size) break;
    }
  } catch {
    // service role unavailable: leave e-mails blank
  }
  return map;
}

export async function emailsByUserId(ids: string[]): Promise<Map<string, string>> {
  const info = await authInfoByUserId(ids);
  return new Map([...info].filter(([, v]) => v.email).map(([k, v]) => [k, v.email]));
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();
  if (!supabase) {
    return { demo: true, kpis: computeKpis(SAMPLE_PAYMENTS, SAMPLE_CONNECTIONS, new Date("2026-11-15T12:00:00Z")), openReports: SAMPLE_REPORTS.filter((r) => r.status === "open").length, meetingsThisMonth: SAMPLE_COUNTS.meetingsRequestedThisMonth, newAdsThisMonth: SAMPLE_COUNTS.newAdsThisMonth };
  }
  const since = monthStartIso();
  const [{ data: payments }, { data: connections }, { count: openReports }, { count: meetings }, { count: ads }] = await Promise.all([
    supabase.from("payments").select("amount_cents, status, paid_at").gte("created_at", since),
    supabase.from("connections").select("status, ended_at"),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("meeting_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("cleaner_profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const kpis = computeKpis(
    ((payments ?? []) as { amount_cents: number; status: string; paid_at: string | null }[]).map((p) => ({ amountCents: p.amount_cents, status: p.status as AdminPayment["status"], paidAt: p.paid_at })),
    ((connections ?? []) as { status: string; ended_at: string | null }[]).map((c) => ({ status: (c.status === "paused" ? "active" : c.status) as "active" | "ended" | "pending", endedAt: c.ended_at })),
  );
  return { demo: false, kpis, openReports: openReports ?? 0, meetingsThisMonth: meetings ?? 0, newAdsThisMonth: ads ?? 0 };
}

export async function listReports(): Promise<{ demo: boolean; reports: AdminReport[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, reports: SAMPLE_REPORTS };
  const { data } = await supabase.from("reports").select("id, reporter_id, subject_type, subject_id, reason, details, status, created_at").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as { id: string; reporter_id: string | null; subject_type: AdminReport["subjectType"]; subject_id: string; reason: string; details: string | null; status: string; created_at: string }[];
  const cleanerIds = rows.filter((r) => r.subject_type === "cleaner_profile").map((r) => r.subject_id);
  const jobIds = rows.filter((r) => r.subject_type === "job").map((r) => r.subject_id);
  const { data: jobRows } = jobIds.length ? await supabase.from("jobs").select("id, space_type, city, frequency").in("id", jobIds) : { data: [] };
  const jobLabel = new Map(((jobRows ?? []) as { id: string; space_type: string; city: string | null; frequency: string }[]).map((j) => [j.id, `${j.space_type} · ${j.city ?? ""} · ${j.frequency}`]));
  const reporterIds = rows.map((r) => r.reporter_id).filter((x): x is string => Boolean(x));
  const [{ data: cleaners }, { data: reporters }] = await Promise.all([
    cleanerIds.length ? supabase.from("cleaner_profiles").select("id, status, profiles!cleaner_profiles_user_id_fkey ( display_name )").in("id", cleanerIds) : Promise.resolve({ data: [] }),
    reporterIds.length ? supabase.from("profiles").select("id, display_name").in("id", reporterIds) : Promise.resolve({ data: [] }),
  ]);
  const cleanerName = new Map(((cleaners ?? []) as unknown as { id: string; profiles: { display_name: string } | null }[]).map((c) => [c.id, c.profiles?.display_name ?? "—"]));
  const reporterName = new Map(((reporters ?? []) as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name]));
  const statusMap: Record<string, AdminReport["status"]> = { open: "open", resolved_hidden: "hidden", resolved_removed: "removed", dismissed: "dismissed" };
  return {
    demo: false,
    reports: rows.map((r) => ({
      id: r.id,
      subject: r.subject_type === "cleaner_profile" ? `Ad: ${cleanerName.get(r.subject_id) ?? r.subject_id.slice(0, 8)}` : r.subject_type === "job" ? `Job: ${jobLabel.get(r.subject_id) ?? r.subject_id.slice(0, 8)}` : r.subject_type === "message" ? "Message" : r.subject_type === "review" ? "Review" : `${r.subject_type} ${r.subject_id.slice(0, 8)}`,
      subjectType: r.subject_type,
      reason: r.reason,
      details: r.details ?? "",
      reporter: r.reporter_id ? reporterName.get(r.reporter_id) ?? "—" : "—",
      createdAt: r.created_at,
      status: statusMap[r.status] ?? "open",
    })),
  };
}


export async function listUsers(): Promise<{ demo: boolean; users: AdminUser[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, users: SAMPLE_USERS };
  const { data } = await supabase.from("profiles").select("id, display_name, role, city, created_at").order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as { id: string; display_name: string; role: AdminUser["role"] | "admin"; city: string | null; created_at: string }[];
  const info = await authInfoByUserId(rows.map((r) => r.id));
  return { demo: false, users: rows.map((r) => ({ id: r.id, name: r.display_name, email: info.get(r.id)?.email ?? "", role: r.role as AdminUser["role"], city: r.city ?? "", createdAt: r.created_at.slice(0, 10), suspended: info.get(r.id)?.suspended ?? false })) };
}

export type AdminAd = { id: string; name: string; city: string; rateCents: number; status: string; verifiedJobs: number; createdAt: string };
export async function listAds(): Promise<{ demo: boolean; ads: AdminAd[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, ads: SAMPLE_CLEANERS.map((c) => ({ id: c.id, name: c.name, city: c.city, rateCents: c.rateCents, status: "published", verifiedJobs: c.verifiedJobs, createdAt: "" })) };
  const { data } = await supabase.from("cleaner_profiles").select("id, status, rate_cents, verified_jobs_count, created_at, profiles!cleaner_profiles_user_id_fkey ( display_name, city )").order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as { id: string; status: string; rate_cents: number; verified_jobs_count: number; created_at: string; profiles: { display_name: string; city: string | null } | null }[];
  return { demo: false, ads: rows.map((r) => ({ id: r.id, name: r.profiles?.display_name ?? "—", city: r.profiles?.city ?? "", rateCents: r.rate_cents, status: r.status, verifiedJobs: r.verified_jobs_count, createdAt: r.created_at.slice(0, 10) })) };
}

export async function listBusinesses(): Promise<{ demo: boolean; businesses: AdminBusiness[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, businesses: SAMPLE_BUSINESSES };
  const [{ data }, rules] = await Promise.all([
    supabase.from("business_profiles").select("id, company_name, business_type, unit_count, unit_price_cents, billing_started_at, billing_ended_at, billing_paused_at, payment_failed_at").order("created_at", { ascending: false }).limit(500),
    getActiveRules(),
  ]);
  const unitPrices = monthlyUnitPrices(rules);
  const rows = (data ?? []) as { id: string; company_name: string; business_type: AdminBusiness["type"] | null; unit_count: number; unit_price_cents: number | null; billing_started_at: string | null; billing_ended_at: string | null; billing_paused_at: string | null; payment_failed_at: string | null }[];
  return {
    demo: false,
    businesses: rows.map((b) => {
      const type = (b.business_type && b.business_type in BUSINESS_TYPES ? b.business_type : "office") as BusinessType;
      const status: AdminBusiness["status"] = b.payment_failed_at || b.billing_paused_at ? "paused" : b.billing_started_at && !b.billing_ended_at ? "active" : "not_started";
      // Phase 1: only an active monthly rule counts; the old placeholder prices no longer apply (0 = nothing charged)
      return { id: b.id, company: b.company_name, type, units: b.unit_count, unitPriceCents: unitPrices[type] ?? 0, billingStartedAt: b.billing_started_at, status };
    }),
  };
}


export async function listPayments(): Promise<{ demo: boolean; payments: AdminPayment[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, payments: SAMPLE_PAYMENTS };
  const [{ data: pays }, { data: invoices }] = await Promise.all([
    supabase.from("payments").select("id, household_id, connection_id, status, amount_cents, paid_at, type").order("created_at", { ascending: false }).limit(300),
    supabase.from("invoices").select("number, payment_id"),
  ]);
  const rows = (pays ?? []) as { id: string; household_id: string; connection_id: string | null; status: string; amount_cents: number; paid_at: string | null; type: string }[];
  const invoiceOf = new Map(((invoices ?? []) as { number: string; payment_id: string | null }[]).filter((i) => i.payment_id).map((i) => [i.payment_id as string, i.number]));
  const hhIds = [...new Set(rows.map((r) => r.household_id))];
  const connIds = rows.map((r) => r.connection_id).filter((x): x is string => Boolean(x));
  const [{ data: names }, { data: conns }] = await Promise.all([
    hhIds.length ? supabase.from("profiles").select("id, display_name").in("id", hhIds) : Promise.resolve({ data: [] }),
    connIds.length ? supabase.from("connections").select("id, cleaner_id").in("id", connIds) : Promise.resolve({ data: [] }),
  ]);
  const cleanerIds = [...new Set(((conns ?? []) as { cleaner_id: string }[]).map((c) => c.cleaner_id))];
  const { data: cleanerNames } = cleanerIds.length ? await supabase.from("profiles").select("id, display_name").in("id", cleanerIds) : { data: [] };
  const nameOf = new Map([...((names ?? []) as { id: string; display_name: string }[]), ...((cleanerNames ?? []) as { id: string; display_name: string }[])].map((n) => [n.id, n.display_name]));
  const cleanerOfConn = new Map(((conns ?? []) as { id: string; cleaner_id: string }[]).map((c) => [c.id, c.cleaner_id]));
  const statusMap: Record<string, AdminPayment["status"]> = { paid: "paid", open: "pending", pending: "pending", failed: "failed", canceled: "failed", expired: "failed", refunded: "refunded" };
  return { demo: false, payments: rows.map((p) => ({ id: p.id, invoiceNumber: invoiceOf.get(p.id) ?? null, household: nameOf.get(p.household_id) ?? "—", cleaner: p.connection_id ? nameOf.get(cleanerOfConn.get(p.connection_id) ?? "") ?? "—" : "—", amountCents: p.amount_cents, status: statusMap[p.status] ?? "pending", paidAt: p.paid_at })) };
}

export type SettingsValues = { householdPriceEuro: string; rateFloorEuro: string; bannedWords: string; videoUrl: string; businessPricing: BusinessPricingForm; signupsPaused?: boolean };
const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
export async function getSettings(): Promise<{ demo: boolean; values: SettingsValues | null }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, values: null };
  const { data } = await supabase.from("settings").select("key, value");
  const map = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    demo: false,
    values: {
      householdPriceEuro: euro(num(map.get("household_fee_cents"), 1495)),
      rateFloorEuro: euro(num(map.get("rate_floor_cents"), 1500)),
      bannedWords: Array.isArray(map.get("banned_words")) ? (map.get("banned_words") as string[]).join(", ") : "",
      videoUrl: typeof map.get("homepage_video_url") === "string" ? (map.get("homepage_video_url") as string) : "",
      businessPricing: toBusinessPricingForm(parseBusinessPricing(map.get("business_pricing"))),
      signupsPaused: map.get("signups_paused") === true,
    },
  };
}

// ========== Phase 1: catalogue, rules, fee events, work ==========
export type AdminFeeEvent = { id: string; business: string; serviceKey: string; eventType: string; occurredAt: string; model: string; amountCents: number; status: "pending" | "invoiced" | "waived"; waivedReason: string | null };
export type AdminWork = { id: string; business: string; cleaner: string; serviceKey: string; scheduledStart: string | null; completedAt: string | null; outcome: string; confirmedAt: string | null; notes: string | null };

export async function listCatalog(): Promise<{ demo: boolean; catalog: CatalogRow[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, catalog: DEFAULT_CATALOG };
  const { data } = await supabase.from("service_catalog").select("service_key, enabled, business_types, sort_order").order("sort_order");
  return { demo: false, catalog: data?.length ? (data as CatalogRow[]) : DEFAULT_CATALOG };
}

export async function listPricingRules(): Promise<{ demo: boolean; rules: PricingRule[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, rules: [] };
  const { data } = await supabase.from("pricing_rules").select("id, service_key, business_type, model, amount_cents, percent, unit, valid_from, valid_to, active, notes").order("service_key").order("valid_from", { ascending: false }).limit(500);
  return { demo: false, rules: (data ?? []) as PricingRule[] };
}

export async function listFeeEvents(): Promise<{ demo: boolean; events: AdminFeeEvent[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, events: [] };
  const { data } = await supabase.from("fee_events").select("id, service_key, event_type, occurred_at, model, amount_cents, status, waived_reason, business_profiles ( company_name )").order("occurred_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as { id: string; service_key: string; event_type: string; occurred_at: string; model: string; amount_cents: number; status: AdminFeeEvent["status"]; waived_reason: string | null; business_profiles: { company_name: string } | null }[];
  return { demo: false, events: rows.map((r) => ({ id: r.id, business: r.business_profiles?.company_name ?? "—", serviceKey: r.service_key, eventType: r.event_type, occurredAt: r.occurred_at, model: r.model, amountCents: r.amount_cents, status: r.status, waivedReason: r.waived_reason })) };
}

export async function listWorkRecords(): Promise<{ demo: boolean; work: AdminWork[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, work: [] };
  const { data } = await supabase.from("work_records").select("id, service_key, scheduled_start, completed_at, outcome, business_confirmed_at, notes, business_profiles ( company_name ), cleaner_profiles ( profiles!cleaner_profiles_user_id_fkey ( display_name ) )").order("scheduled_start", { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as { id: string; service_key: string; scheduled_start: string | null; completed_at: string | null; outcome: string; business_confirmed_at: string | null; notes: string | null; business_profiles: { company_name: string } | null; cleaner_profiles: { profiles: { display_name: string } | null } | null }[];
  return { demo: false, work: rows.map((r) => ({ id: r.id, business: r.business_profiles?.company_name ?? "—", cleaner: r.cleaner_profiles?.profiles?.display_name ?? "—", serviceKey: r.service_key, scheduledStart: r.scheduled_start, completedAt: r.completed_at, outcome: r.outcome, confirmedAt: r.business_confirmed_at, notes: r.notes })) };
}

// ========== Website: testimonials ==========
export type AdminTestimonial = { id: string; name: string; role: string | null; city: string | null; quote: string; published: boolean; created_at: string };

export async function listTestimonials(): Promise<{ demo: boolean; items: AdminTestimonial[] }> {
  const supabase = await createClient();
  if (!supabase) return { demo: true, items: [] };
  const { data } = await supabase.from("testimonials").select("id, name, role, city, quote, published, created_at").order("created_at", { ascending: false }).limit(200);
  return { demo: false, items: (data ?? []) as AdminTestimonial[] };
}
