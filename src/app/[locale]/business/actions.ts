"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
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

/** Remove a unit; the last unit cannot be removed. */
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

