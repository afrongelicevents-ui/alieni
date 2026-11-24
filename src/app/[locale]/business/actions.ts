"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, getSessionUser, requireUserRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
import { SERVICE_KEYS, assertServiceEnabled, type ServiceKey } from "@/lib/services";
import { batch, first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";
import { dutchPostcodeSchema } from "@/lib/validation";

export type BusinessActionState = { ok: boolean; error?: string; id?: string; detail?: string };

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

const unitSchema = z.object({
  name: z.string().trim().max(120),
  addressLine: z.string().trim().min(1).max(200),
  postcode: dutchPostcodeSchema,
  city: z.string().trim().min(1).max(80),
});
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  companyName: z.string().trim().min(1).max(120),
  btwNumber: z.string().trim().max(20),
  businessType: z.enum(BUSINESS_TYPE_KEYS as [BusinessType, ...BusinessType[]]),
  unitCount: z.number().int().min(1).max(1000),
  units: z.array(unitSchema).min(1).max(10),
});
export type BusinessProfileInput = z.input<typeof profileSchema>;

/** The signed-in business account's own business_profiles id (or null). */
async function myBusiness(userId: string) {
  return first<{ id: string; business_type: BusinessType | null; unit_count: number }>("SELECT id, business_type, unit_count FROM business_profiles WHERE user_id = ?", userId);
}

/** Create (or update) the signed-in user's business profile + initial units. Only business accounts. */
export async function saveBusinessProfile(input: BusinessProfileInput): Promise<BusinessActionState> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const b = parsed.data;
  try {
    // only a business account creates a company profile (never rename a household, cleaner or admin first)
    const { userId } = await requireUserRole(["business"]);
    const existing = await myBusiness(userId);
    const businessId = existing?.id ?? uuid();
    const stmts: [string, ...(string | number | null)[]][] = [
      ["UPDATE profiles SET display_name = ? WHERE id = ?", b.companyName.slice(0, 80), userId],
      existing
        ? ["UPDATE business_profiles SET company_name = ?, btw_number = ?, business_type = ?, contact_first_name = ?, contact_last_name = ?, unit_count = ? WHERE id = ? AND user_id = ?",
            b.companyName, b.btwNumber || null, b.businessType, b.firstName, b.lastName, b.unitCount, businessId, userId]
        : ["INSERT INTO business_profiles (id, user_id, company_name, btw_number, business_type, contact_first_name, contact_last_name, unit_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            businessId, userId, b.companyName, b.btwNumber || null, b.businessType, b.firstName, b.lastName, b.unitCount],
    ];
    // units are created with the profile; a retry adds them when the business still has none
    const hasUnits = existing ? await first("SELECT 1 AS x FROM business_units WHERE business_id = ? LIMIT 1", businessId) : null;
    if (!hasUnits) {
      for (const u of b.units) {
        const point = await geocode(u.postcode);
        stmts.push([
          "INSERT INTO business_units (id, business_id, name, address_line, postcode, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          uuid(), businessId, u.name || u.addressLine, u.addressLine, u.postcode, u.city, point?.lat ?? null, point?.lng ?? null,
        ]);
      }
    }
    await batch(stmts);
    revalidatePath("/", "layout");
    return { ok: true, id: businessId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function addBusinessUnit(input: z.input<typeof unitSchema>): Promise<BusinessActionState> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const u = parsed.data;
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await myBusiness(userId);
    if (!bp) return { ok: false, error: "no_business" };
    if (!(await rateLimit(`unit:${userId}`, 50, 86400))) return { ok: false, error: "rate_limit" };
    const count = await first<{ n: number }>("SELECT COUNT(*) AS n FROM business_units WHERE business_id = ?", bp.id);
    if ((count?.n ?? 0) >= 100) return { ok: false, error: "invalid" };
    const point = await geocode(u.postcode);
    const id = uuid();
    await run("INSERT INTO business_units (id, business_id, name, address_line, postcode, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, bp.id, u.name || u.addressLine, u.addressLine, u.postcode, u.city, point?.lat ?? null, point?.lng ?? null);
    revalidatePath("/business/dashboard");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

const detailsSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  companyName: z.string().trim().min(1).max(80),
  btwNumber: z.string().trim().max(20),
});

/** Edit the company name, VAT number and contact person (the business type and unit count have their own controls). */
export async function updateBusinessDetails(input: z.input<typeof detailsSchema>): Promise<BusinessActionState> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await myBusiness(userId);
    if (!bp) return { ok: false, error: "no_business" };
    await batch([
      ["UPDATE business_profiles SET company_name = ?, btw_number = ?, contact_first_name = ?, contact_last_name = ? WHERE id = ? AND user_id = ?",
        d.companyName, d.btwNumber || null, d.firstName, d.lastName, bp.id, userId],
      ["UPDATE profiles SET display_name = ? WHERE id = ?", d.companyName, userId],
    ]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Change a unit's name or address (only a unit of the signed-in business). */
export async function updateBusinessUnit(unitId: string, input: z.input<typeof unitSchema>): Promise<BusinessActionState> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success || !isId(unitId)) return { ok: false, error: "invalid" };
  const u = parsed.data;
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await myBusiness(userId);
    if (!bp) return { ok: false, error: "no_business" };
    const point = await geocode(u.postcode);
    const changed = await run(
      "UPDATE business_units SET name = ?, address_line = ?, postcode = ?, city = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng) WHERE id = ? AND business_id = ?",
      u.name || u.addressLine, u.addressLine, u.postcode, u.city, point?.lat ?? null, point?.lng ?? null, unitId, bp.id,
    );
    if (!changed) return { ok: false, error: "not_found" };
    revalidatePath("/business/profile");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Remove a unit; the last unit cannot be removed. */
export async function removeBusinessUnit(unitId: string): Promise<BusinessActionState> {
  if (!isId(unitId)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await myBusiness(userId);
    if (!bp) return { ok: false, error: "no_business" };
    const count = await first<{ n: number }>("SELECT COUNT(*) AS n FROM business_units WHERE business_id = ?", bp.id);
    if ((count?.n ?? 0) <= 1) return { ok: false, error: "last_unit" };
    const changed = await run("DELETE FROM business_units WHERE id = ? AND business_id = ?", unitId, bp.id);
    if (!changed) return { ok: false, error: "not_found" };
    revalidatePath("/business/profile");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Unit count (payments are off, so the change applies at once). */
export async function updateUnitCount(count: number): Promise<BusinessActionState> {
  const n = Math.round(count);
  if (!Number.isFinite(n) || n < 1 || n > 1000) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const changed = await run("UPDATE business_profiles SET unit_count = ? WHERE user_id = ?", n, userId);
    if (!changed) return { ok: false, error: "no_business" };
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Business (or household / admin) confirms (ok) or disputes (not ok) a work record — only a record of their own
 * business or household; admins may decide any.
 */
export async function reviewWork(recordId: string, ok: boolean, note: string): Promise<BusinessActionState> {
  if (!isId(recordId)) return { ok: false, error: "invalid" };
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "not_signed_in" };
    if (user.role === "admin" && !user.twoFactorEnabled) return { ok: false, error: "two_factor_required" };
    const rec = await first<{ id: string }>(
      `SELECT w.id FROM work_records w LEFT JOIN business_profiles bp ON bp.id = w.business_id
       WHERE w.id = ? AND (bp.user_id = ? OR w.household_id = ? OR ? = 'admin')`,
      recordId, user.id, user.id, user.role,
    );
    if (!rec) return { ok: false, error: "not_found" };
    const text = note.trim().slice(0, 1000);
    const now = nowIso();
    if (ok) {
      await run("UPDATE work_records SET business_confirmed_at = ?, outcome = CASE WHEN outcome = 'scheduled' THEN 'done' ELSE outcome END, notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?",
        now, text, now, recordId);
    } else {
      await run("UPDATE work_records SET outcome = 'disputed', notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", text, now, recordId);
    }
    revalidatePath("/business/work");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Used by the dashboard tiles: a service that is off is refused server-side as well. */
export async function openService(service: string): Promise<BusinessActionState> {
  if (!(SERVICE_KEYS as readonly string[]).includes(service)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUserRole(["business"]);
    const bp = await myBusiness(userId);
    if (!bp) return { ok: false, error: "no_business" };
    if (!(await assertServiceEnabled(service as ServiceKey, bp.business_type))) return { ok: false, error: "service_disabled" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
