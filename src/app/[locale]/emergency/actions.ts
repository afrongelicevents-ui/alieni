"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { assertServiceEnabled } from "@/lib/services";
import { geocode } from "@/lib/geocode";
import { dutchPostcodeSchema } from "@/lib/validation";

export type EmergencyActionState = { ok: boolean; error?: string; id?: string };

const requestSchema = z.object({
  addressLine: z.string().trim().min(1).max(200),
  postcode: dutchPostcodeSchema,
  city: z.string().trim().min(1).max(80),
  windowStart: z.string(), // ISO
  windowEnd: z.string(),
  hours: z.number().min(1).max(12),
  tasks: z.string().trim().min(5).max(1000),
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
    const point = await geocode(r.postcode);
    const { data, error } = await supabase
      .from("emergency_requests")
      .insert({
        requester_id: userId,
        requester_type: bp ? "business" : "household",
        address_line: r.addressLine,
        postcode: r.postcode,
        city: r.city,
        location: point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : null,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        hours: r.hours,
        tasks: r.tasks,
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
    revalidatePath("/cleaners/emergency");
    revalidatePath("/emergency");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
