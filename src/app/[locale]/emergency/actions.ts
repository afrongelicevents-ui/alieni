"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { assertServiceEnabled } from "@/lib/services";
import { geocode } from "@/lib/geocode";
import { dutchPostcodeSchema } from "@/lib/validation";
import { isDateAllowed } from "@/lib/cover";
import { getCoverRules } from "@/lib/cover-data";
import { notifyUser } from "@/lib/notify";

export type EmergencyActionState = { ok: boolean; error?: string; id?: string };

const requestSchema = z.object({
  addressLine: z.string().trim().max(200).default(""),
  postcode: z.string().trim().max(10).default(""),
  city: z.string().trim().max(80).default(""),
  windowStart: z.string(), // ISO
  windowEnd: z.string(),
  hours: z.number().min(1).max(12),
  tasks: z.string().trim().min(5).max(1000),
  // business only (Phase 2): cover at one of the company's locations, with a report-to line
  unitId: z.string().uuid().nullable().default(null),
  reportTo: z.string().trim().max(200).default(""),
});
export type EmergencyInput = z.input<typeof requestSchema>;

/** Same-day request. The exact address is only ever shown to the accepting cleaner. */
export async function createEmergencyRequest(input: EmergencyInput): Promise<EmergencyActionState> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const r = parsed.data;
  const start = new Date(r.windowStart);
  const end = new Date(r.windowEnd);
  if (!(end > start)) return { ok: false, error: "window" };
  if (start.getTime() < Date.now() - 5 * 60e3) return { ok: false, error: "past" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: bp } = await supabase.from("business_profiles").select("id, business_type").eq("user_id", userId).maybeSingle();
    // Businesses: the 'cover' service must be switched on for their sector (households are unaffected).
    if (bp && !(await assertServiceEnabled("cover", bp.business_type))) return { ok: false, error: "service_disabled" };
    let address = { addressLine: r.addressLine, postcode: r.postcode, city: r.city };
    if (bp && r.unitId) {
      // location from one of the company's units (RLS: only its own units are readable)
      const { data: unit } = await supabase.from("business_units").select("address_line, postcode, city").eq("id", r.unitId).eq("business_id", bp.id).maybeSingle();
      if (!unit) return { ok: false, error: "unit" };
      address = { addressLine: unit.address_line, postcode: unit.postcode, city: unit.city };
    }
    const pc = dutchPostcodeSchema.safeParse(address.postcode);
    if (!pc.success || !address.addressLine || !address.city) return { ok: false, error: "invalid" };
    if (bp) {
      // businesses: today or a day within the configured horizon (households keep their same-day form)
      const rules = await getCoverRules();
      if (!isDateAllowed(start.toISOString().slice(0, 10), new Date(), rules)) return { ok: false, error: "date" };
    }
    const point = await geocode(pc.data);
    const { data, error } = await supabase
      .from("emergency_requests")
      .insert({
        requester_id: userId,
        requester_type: bp ? "business" : "household",
        address_line: address.addressLine,
        postcode: pc.data,
        city: address.city,
        location: point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : null,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        hours: r.hours,
        tasks: r.tasks,
        unit_id: bp ? r.unitId : null,
        report_to: bp && r.reportTo ? r.reportTo : null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message?.includes("limit") ? "rate_limit" : "save_failed" };
    revalidatePath("/emergency");
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

export async function cancelEmergencyRequest(id: string): Promise<EmergencyActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase.from("emergency_requests").update({ status: "cancelled" }).eq("id", id).eq("requester_id", userId).eq("status", "searching");
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/emergency");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Cleaner accepts: first one wins (atomic in the database function). */
export async function acceptEmergencyRequest(id: string): Promise<EmergencyActionState> {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("accept_emergency_request", { p_request_id: id });
    if (error) return { ok: false, error: "save_failed" };
    if (!data) return { ok: false, error: "taken" };
    // best-effort e-mail to the requester (no chat text, brief §7)
    const { data: req } = await supabase.from("emergency_requests").select("requester_id").eq("id", id).maybeSingle();
    if (req?.requester_id) void notifyUser(req.requester_id, "Je spoedaanvraag is geaccepteerd — Alieni", ["Hoi!", "", "Een schoonmaker heeft je spoedaanvraag geaccepteerd. Log in om de details te zien:", `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/emergency`, "", "Groetjes, Alieni"].join("\n"));
    revalidatePath("/cleaners/emergency");
    revalidatePath("/emergency");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

// ========== Phase 2: cover for businesses ==========

export type CancelResult = EmergencyActionState & { result?: "cancelled_free" | "cancelled_late" };

/** Cancel inside or outside the window (the database decides; a late cancel keeps the recorded fee event). */
export async function cancelCover(id: string, reason: string): Promise<CancelResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("emergency_requests").select("accepted_by, status").eq("id", id).maybeSingle();
    const { data, error } = await supabase.rpc("cancel_emergency_request", { p_request_id: id, p_reason: reason.trim().slice(0, 300) });
    if (error) return { ok: false, error: "save_failed" };
    if (data !== "cancelled_free" && data !== "cancelled_late") return { ok: false, error: "not_allowed" };
    if (before?.status === "accepted" && before.accepted_by) {
      const { data: cp } = await supabase.from("cleaner_profiles").select("user_id").eq("id", before.accepted_by).maybeSingle();
      if (cp?.user_id) void notifyUser(cp.user_id, "Spoedklus geannuleerd — Alieni", ["Hoi!", "", "De klant heeft een door jou geaccepteerde spoedklus geannuleerd. Bekijk je klussen:", `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/work?tab=emergency`, "", "Groetjes, Alieni"].join("\n"));
    }
    revalidatePath("/emergency");
    revalidatePath("/business/dashboard");
    return { ok: true, result: data };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** "Did the cleaner come?" — came: work done + confirmed; no-show: fee waived, strike, opt-in removed at the limit. */
export async function reportAttendance(id: string, came: boolean, note: string): Promise<EmergencyActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("report_emergency_attendance", { p_request_id: id, p_came: came, p_note: note.trim().slice(0, 500) });
    if (error) return { ok: false, error: "save_failed" };
    if (!data) return { ok: false, error: "not_allowed" };
    revalidatePath("/emergency");
    revalidatePath("/business/work");
    revalidatePath("/business/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Open (or find) the chat between the requester and the cleaner who accepted. */
export async function openCoverChat(id: string): Promise<EmergencyActionState & { conversationId?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: req } = await supabase.from("emergency_requests").select("accepted_by").eq("id", id).eq("requester_id", userId).maybeSingle();
    if (!req?.accepted_by) return { ok: false, error: "not_allowed" };
    const { data: cp } = await supabase.from("cleaner_profiles").select("user_id").eq("id", req.accepted_by).maybeSingle();
    if (!cp) return { ok: false, error: "not_allowed" };
    const { data: existing } = await supabase.from("conversations").select("id").eq("household_id", userId).eq("cleaner_id", cp.user_id).maybeSingle();
    if (existing) return { ok: true, conversationId: existing.id };
    const { data, error } = await supabase.from("conversations").insert({ household_id: userId, cleaner_id: cp.user_id }).select("id").single();
    if (error || !data) return { ok: false, error: "save_failed" };
    return { ok: true, conversationId: data.id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
