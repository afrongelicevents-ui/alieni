"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { errorCode, requireUser } from "@/lib/auth";
import { maskContacts } from "@/lib/masking";
import { meetingRequestEmail } from "@/lib/email";
import { createMollieClient } from "@/lib/mollie";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { dealConfirmedNotice, newMessageNotice, notifyUser } from "@/lib/notify";

/** Public site URL: configured value first, then Vercel's production host, then the request host (dev only). */
async function appUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export type ChatActionState = { ok: boolean; error?: string; conversationId?: string };

const meetingSchema = z.object({
  cleanerProfileId: z.string().uuid(),
  type: z.enum(["in_person", "video"]),
  weekday: z.number().int().min(0).max(6),
  block: z.enum(["morning", "afternoon", "evening"]),
  message: z.string().trim().max(500),
});

/** Household asks a cleaner for a meeting: request + conversation + first message. */
export async function requestMeeting(input: z.input<typeof meetingSchema>): Promise<ChatActionState> {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "cleanerProfileId") ? "sample_subject" : "invalid" };
  const m = parsed.data;
  try {
    const { supabase, userId } = await requireUser();
    const { data: cleaner } = await supabase.from("cleaner_profiles").select("id, user_id, status").eq("id", m.cleanerProfileId).maybeSingle();
    if (!cleaner || cleaner.status !== "published") return { ok: false, error: "not_available" };
    if (cleaner.user_id === userId) return { ok: false, error: "own_ad" };

    const { data: request, error: reqErr } = await supabase
      .from("meeting_requests")
      .insert({ household_id: userId, cleaner_profile_id: cleaner.id, type: m.type, proposed_weekday: m.weekday, proposed_block: m.block, message: m.message || null })
      .select("id")
      .single();
    if (reqErr || !request) return { ok: false, error: "save_failed" };

    // One conversation per pair; a new request attaches to the existing thread.
    const { data: existing } = await supabase.from("conversations").select("id").eq("household_id", userId).eq("cleaner_id", cleaner.user_id).maybeSingle();
    let conversationId = existing?.id as string | undefined;
    if (conversationId) {
      await supabase.from("conversations").update({ meeting_request_id: request.id, last_message_at: new Date().toISOString() }).eq("id", conversationId);
    } else {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({ household_id: userId, cleaner_id: cleaner.user_id, meeting_request_id: request.id })
        .select("id")
        .single();
      if (convErr || !conv) return { ok: false, error: "save_failed" };
      conversationId = conv.id;
    }

    if (m.message) {
      const { text } = maskContacts(m.message);
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, body: text, masked: true });
    }
    // Best-effort e-mail to the cleaner (no message content, brief §7).
    const { data: cleanerProfile } = await supabase.from("profiles").select("display_name").eq("id", cleaner.user_id).maybeSingle();
    const mail = meetingRequestEmail(cleanerProfile?.display_name ?? "");
    void notifyUser(cleaner.user_id, mail.subject, mail.text);
    revalidatePath("/", "layout");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

async function membership(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], conversationId: string, userId: string) {
  const { data: conv } = await supabase.from("conversations").select("id, household_id, cleaner_id").eq("id", conversationId).maybeSingle();
  if (!conv) return null;
  const role = conv.household_id === userId ? "household" : conv.cleaner_id === userId ? "cleaner" : null;
  if (!role) return null;
  const { data: conn } = await supabase
    .from("connections")
    .select("id, status, household_confirmed_at, cleaner_confirmed_at")
    .eq("household_id", conv.household_id)
    .eq("cleaner_id", conv.cleaner_id)
    .maybeSingle();
  return { conv, role, conn };
}

/** Send a chat message. Contacts are masked server-side until a connection is active. */
export async function sendMessage(conversationId: string, body: string): Promise<ChatActionState> {
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const member = await membership(supabase, conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const active = member.conn?.status === "active";
    const stored = active ? text : maskContacts(text).text;
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, body: stored, masked: !active });
    if (error) return { ok: false, error: "save_failed" };
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    // Notify the other party at most once per quiet hour (no message content).
    const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
    const { count: recent } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("sender_id", userId).gte("created_at", new Date(Date.now() - 60 * 60e3).toISOString());
    if ((recent ?? 0) <= 1) {
      const mail = newMessageNotice(await appUrl());
      void notifyUser(otherId, mail.subject, mail.text);
    }
    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/messages");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** Cleaner accepts or declines a meeting request. */
export async function respondMeeting(meetingId: string, status: "accepted" | "declined"): Promise<ChatActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const { data: req } = await supabase.from("meeting_requests").select("id, cleaner_profiles ( user_id )").eq("id", meetingId).maybeSingle();
    const owner = (req as unknown as { cleaner_profiles: { user_id: string } | null } | null)?.cleaner_profiles?.user_id;
    if (!req || owner !== userId) return { ok: false, error: "not_member" };
    const { error } = await supabase.from("meeting_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", meetingId);
    if (error) return { ok: false, error: "save_failed" };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** "We have a deal": each party confirms; the database activates it when both did. */
export async function confirmDeal(conversationId: string): Promise<ChatActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const member = await membership(supabase, conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const column = member.role === "household" ? "household_confirmed_at" : "cleaner_confirmed_at";
    const now = new Date().toISOString();
    if (member.conn) {
      if (member.conn.status === "ended") {
        // Re-opening after "not a match" or an ended connection: start a fresh pending round.
        const { error } = await supabase
          .from("connections")
          .update({ status: "pending", household_confirmed_at: null, cleaner_confirmed_at: null, started_at: null, ended_at: null, [column]: now })
          .eq("id", member.conn.id);
        if (error) return { ok: false, error: "save_failed" };
      } else {
        const { error } = await supabase.from("connections").update({ [column]: now }).eq("id", member.conn.id);
        if (error) return { ok: false, error: "save_failed" };
      }
    } else {
      const { error } = await supabase
        .from("connections")
        .insert({ household_id: member.conv.household_id, cleaner_id: member.conv.cleaner_id, status: "pending", [column]: now });
      if (error) return { ok: false, error: "save_failed" };
    }
    // Tell the other party (best effort).
    const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    const mail = dealConfirmedNotice(me?.display_name ?? "", await appUrl());
    void notifyUser(otherId, mail.subject, mail.text);
    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/account");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** "Not a match" (nothing charged) or ending an active connection. */
export async function endConnection(conversationId: string): Promise<ChatActionState> {
  try {
    const { supabase, userId } = await requireUser();
    const member = await membership(supabase, conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const now = new Date().toISOString();
    if (member.conn) {
      const { error } = await supabase.from("connections").update({ status: "ended", ended_at: now }).eq("id", member.conn.id);
      if (error) return { ok: false, error: "save_failed" };
    } else {
      const { error } = await supabase
        .from("connections")
        .insert({ household_id: member.conv.household_id, cleaner_id: member.conv.cleaner_id, status: "ended", ended_at: now });
      if (error) return { ok: false, error: "save_failed" };
    }
    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/account");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Household sets up payment for an active connection (brief §3.7): a €0.01
 * iDEAL verification creates the SEPA mandate; the webhook then charges
 * €14.95 and starts the monthly subscription. Returns the Mollie checkout URL.
 */
export async function setupHouseholdPayment(conversationId: string): Promise<ChatActionState & { checkoutUrl?: string }> {
  const mollie = createMollieClient();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!mollie || !serviceKey || !supabaseUrl) return { ok: false, error: "payments_not_configured" };
  try {
    const { supabase, userId, email } = await requireUser();
    const member = await membership(supabase, conversationId, userId);
    if (!member || member.role !== "household") return { ok: false, error: "not_member" };
    if (member.conn?.status !== "active") return { ok: false, error: "not_active" };
    // Mollie identifiers are server-only columns: read/write them with the service role.
    const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await admin.from("profiles").select("display_name, mollie_customer_id").eq("id", userId).maybeSingle();
    let customerId = profile?.mollie_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await mollie.createCustomer(profile?.display_name ?? email, email);
      customerId = customer.id;
      const { error } = await admin.from("profiles").update({ mollie_customer_id: customerId }).eq("id", userId);
      if (error) return { ok: false, error: "save_failed" };
    }
    const base = await appUrl();
    const payment = await mollie.createMandatePayment(customerId, `${base}/messages/${conversationId}?payment=started`, `${base}/api/mollie/webhook`, { profile_id: userId });
    const checkoutUrl = payment._links?.checkout?.href;
    if (!checkoutUrl) return { ok: false, error: "failed" };
    await admin.from("connections").update({ mollie_customer_id: customerId }).eq("id", member.conn.id);
    return { ok: true, conversationId, checkoutUrl };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}
