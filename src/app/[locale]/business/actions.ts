"use server";

import { amsterdamInstant } from "@/lib/tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
import { isSafeIcalUrl } from "@/lib/url-safety";
import { dbErrorCode, detailOf } from "@/lib/db-errors";
import { SERVICE_KEYS, assertServiceEnabled, type ServiceKey } from "@/lib/services";
import { dutchPostcodeSchema } from "@/lib/validation";

export type BusinessActionState = { ok: boolean; error?: string; id?: string; detail?: string };

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
  unitCount: z.number().int().min(1).max(10000),
  units: z.array(unitSchema).min(1).max(10),
});
export type BusinessProfileInput = z.input<typeof profileSchema>;

/** Create (or update) the signed-in user's business profile + initial units. */
export async function saveBusinessProfile(input: BusinessProfileInput): Promise<BusinessActionState> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const b = parsed.data;
  try {
    const { supabase, userId } = await requireUser();
    // only a business account creates a company profile (never rename a household, cleaner or admin first)
    const { data: me } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (me?.role !== "business") return { ok: false, error: "not_allowed" };
    const { error: nameError } = await supabase.from("profiles").update({ display_name: b.companyName.slice(0, 80) }).eq("id", userId);
    if (nameError) return { ok: false, error: dbErrorCode(nameError), detail: detailOf(nameError, "profiles") };
    const { data: existing } = await supabase.from("business_profiles").select("id, billing_started_at").eq("user_id", userId).maybeSingle();
    const row = {
      company_name: b.companyName,
      btw_number: b.btwNumber || null,
      business_type: b.businessType,
      contact_first_name: b.firstName,
      contact_last_name: b.lastName,
      unit_count: b.unitCount,
      // unit_price_cents is locked by the database from settings at creation
    };
    const { data: saved, error } = existing
      ? await supabase.from("business_profiles").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("business_profiles").insert({ ...row, user_id: userId }).select("id").single();
    if (error || !saved) return { ok: false, error: dbErrorCode(error), detail: detailOf(error, "business_profiles") };

    // units are created with the profile; a retry after a failed unit insert adds them when the business still has none
    const { count: unitCount } = await supabase.from("business_units").select("id", { count: "exact", head: true }).eq("business_id", saved.id);
    if (!unitCount) {
      const units = await Promise.all(
        b.units.map(async (u) => {
          const point = await geocode(u.postcode);
          return {
            business_id: saved.id,
            name: u.name || u.addressLine,
            address_line: u.addressLine,
            postcode: u.postcode,
            city: u.city,
            location: point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : null,
          };
        }),
      );
      const { error: unitErr } = await supabase.from("business_units").insert(units);
      if (unitErr) return { ok: false, error: dbErrorCode(unitErr), detail: detailOf(unitErr, "business_units") };
    }
    revalidatePath("/", "layout");
    return { ok: true, id: saved.id };
  } catch (err) {
    return { ok: false, error: errorCode(err), detail: err instanceof Error ? err.message : undefined };
  }
}

export async function addBusinessUnit(input: z.input<typeof unitSchema>): Promise<BusinessActionState> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const u = parsed.data;
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    const point = await geocode(u.postcode);
    const { data, error } = await supabase
      .from("business_units")
      .insert({ business_id: bp.id, name: u.name || u.addressLine, address_line: u.addressLine, postcode: u.postcode, city: u.city, location: point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : null })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "save_failed" };
    revalidatePath("/business/dashboard");
    return { ok: true, id: data.id };
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
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    const { error } = await supabase.from("business_profiles").update({ company_name: d.companyName, btw_number: d.btwNumber || null, contact_first_name: d.firstName, contact_last_name: d.lastName }).eq("id", bp.id);
    if (error) return { ok: false, error: dbErrorCode(error), detail: detailOf(error, "business_profiles") };
    await supabase.from("profiles").update({ display_name: d.companyName }).eq("id", userId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Change a unit's name or address (the unit must belong to the signed-in business; the database rule checks it too). */
export async function updateBusinessUnit(unitId: string, input: z.input<typeof unitSchema>): Promise<BusinessActionState> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(unitId)) return { ok: false, error: "invalid" };
  const u = parsed.data;
  try {
    const { supabase } = await requireUser();
    const point = await geocode(u.postcode);
    const { data, error } = await supabase
      .from("business_units")
      .update({ name: u.name || u.addressLine, address_line: u.addressLine, postcode: u.postcode, city: u.city, ...(point ? { location: `SRID=4326;POINT(${point.lng} ${point.lat})` } : {}) })
      .eq("id", unitId)
      .select("id");
    if (error) return { ok: false, error: dbErrorCode(error) };
    if (!data?.length) return { ok: false, error: "not_found" };
    revalidatePath("/business/profile");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Remove a unit. Its open turnover slots go with it; the last unit cannot be removed. */
export async function removeBusinessUnit(unitId: string): Promise<BusinessActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(unitId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    const { count } = await supabase.from("business_units").select("id", { count: "exact", head: true }).eq("business_id", bp.id);
    if ((count ?? 0) <= 1) return { ok: false, error: "last_unit" };
    const { data, error } = await supabase.from("business_units").delete().eq("id", unitId).eq("business_id", bp.id).select("id");
    if (error) return { ok: false, error: dbErrorCode(error) };
    if (!data?.length) return { ok: false, error: "not_found" };
    revalidatePath("/business/profile");
    revalidatePath("/business/dashboard");
    revalidatePath("/business/calendar");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Unit count: immediate before billing starts; from next month afterwards. */
export async function updateUnitCount(count: number): Promise<BusinessActionState> {
  const n = Math.round(count);
  if (!Number.isFinite(n) || n < 1 || n > 10000) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id, unit_count, billing_started_at").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    const patch = bp.billing_started_at ? { pending_unit_count: n === bp.unit_count ? null : n } : { unit_count: n, pending_unit_count: null };
    const { error } = await supabase.from("business_profiles").update(patch).eq("id", bp.id);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function cancelBusinessBilling(): Promise<BusinessActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const { data, error } = await supabase.from("business_profiles").update({ billing_ended_at: new Date().toISOString() }).eq("user_id", userId).select("id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "not_found" };
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Link (or clear) a unit's iCal feed. The daily sync job fetches it server-side. */
export async function saveIcalUrl(unitId: string, url: string): Promise<BusinessActionState> {
  const trimmed = url.trim();
  if (trimmed && !isSafeIcalUrl(trimmed)) return { ok: false, error: "unsafe_url" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("business_type").eq("user_id", userId).maybeSingle();
    if (trimmed && !(await assertServiceEnabled("turnover", bp?.business_type ?? null))) return { ok: false, error: "service_disabled" };
    const { data, error } = await supabase.from("business_units").update({ ical_url: trimmed || null, ical_last_error: null }).eq("id", unitId).select("id");
    if (error) return { ok: false, error: "save_failed" };
    if (!data?.length) return { ok: false, error: "not_found" }; // RLS hid the unit: nothing was saved
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Hotels: add N manual turnovers on a date (checkout → check-in window). */
export async function addManualTurnovers(unitId: string, date: string, count: number): Promise<BusinessActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "invalid" };
  const n = Math.min(50, Math.max(1, Math.round(count)));
  try {
    const { supabase, userId } = await requireUser();
    const { data: unit } = await supabase.from("business_units").select("id, business_id, checkout_time, checkin_time, business_profiles ( user_id )").eq("id", unitId).maybeSingle();
    if (!unit) return { ok: false, error: "no_business" };
    const owner = (unit as unknown as { business_profiles: { user_id: string } | null }).business_profiles?.user_id;
    if (owner && owner !== userId) return { ok: false, error: "no_business" };
    const { data: bp } = await supabase.from("business_profiles").select("business_type").eq("id", unit.business_id).maybeSingle();
    if (!(await assertServiceEnabled("turnover", bp?.business_type ?? null))) return { ok: false, error: "service_disabled" };
    const rows = Array.from({ length: n }, (_, i) => ({
      unit_id: unit.id,
      business_id: unit.business_id,
      source: "manual",
      external_uid: `manual-${date}-${Date.now().toString(36)}-${i}`,
      slot_date: date,
      starts_at: amsterdamInstant(date, unit.checkout_time ?? "11:00"),
      ends_at: amsterdamInstant(date, unit.checkin_time ?? "15:00"),
      status: "open",
    }));
    const { error } = await supabase.from("cleaning_slots").insert(rows);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Business confirms (ok) or disputes (not ok) a work record. Ownership is checked inside the database function. */
export async function reviewWork(recordId: string, ok: boolean, note: string): Promise<BusinessActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("review_work_record", { p_record_id: recordId, p_ok: ok, p_note: note.trim().slice(0, 1000) });
    if (error) return { ok: false, error: "save_failed" };
    if (!data) return { ok: false, error: "not_found" };
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
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("business_type").eq("user_id", userId).maybeSingle();
    if (!bp) return { ok: false, error: "no_business" };
    if (!(await assertServiceEnabled(service as ServiceKey, bp.business_type))) return { ok: false, error: "service_disabled" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Cancel a turnover slot, or open a reserved one again (the cleaner's scheduled work goes away). */
export async function setSlotStatus(slotId: string, status: "cancelled" | "open"): Promise<BusinessActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId) || !["cancelled", "open"].includes(status)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const patch = status === "open" ? { status, reserved_by: null, reserved_at: null, reminder_sent_at: null } : { status };
    const { data, error } = await supabase.from("cleaning_slots").update(patch).eq("id", slotId).neq("status", "done").select("id");
    if (error) return { ok: false, error: dbErrorCode(error) };
    if (!data?.length) return { ok: false, error: "not_found" };
    revalidatePath("/business/calendar");
    revalidatePath("/business/requests");
    revalidatePath("/cleaners/slots");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
