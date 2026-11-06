"use server";

import { rateLimit } from "@/lib/rate-limit";
import { findBannedWord, getBannedWords } from "@/lib/site-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { maskContacts } from "@/lib/masking";
import { meetingRequestEmail } from "@/lib/email";
import { createMollieClient } from "@/lib/mollie";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { appBaseUrl as appUrl, meetingProposalAnsweredNotice, meetingProposalNotice, meetingWithdrawnNotice, connectionEndedNotice, dealActiveNotice, dealConfirmedNotice, meetingResponseNotice, newMessageNotice, notifyUser } from "@/lib/notify";

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
    if (!rateLimit(`meeting:${userId}`, 10, 60 * 60_000)) return { ok: false, error: "rate_limit" };
    const { data: cleaner } = await supabase.from("cleaner_profiles").select("id, user_id, status, work_scope").eq("id", m.cleanerProfileId).maybeSingle();
    if (!cleaner || cleaner.status !== "published") return { ok: false, error: "not_available" };
    if (cleaner.user_id === userId) return { ok: false, error: "own_ad" };
    // a cleaner who works only for households (or only for businesses) is not offered to the other side
    const { data: asker } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    const scope = (cleaner.work_scope as string | null) ?? "household";
    if (scope !== "both" && !(asker ? scope === "commercial" : scope === "household")) return { ok: false, error: "not_available" };

    // an earlier open request to the same cleaner is replaced by this one (it is recorded as withdrawn)
    const { data: open } = await supabase.from("meeting_requests").select("id").eq("household_id", userId).eq("cleaner_profile_id", cleaner.id).in("status", ["requested", "accepted", "rescheduled"]);
    for (const o of (open ?? []) as { id: string }[]) await supabase.rpc("withdraw_meeting_request", { p_request_id: o.id });

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
    await notifyUser(cleaner.user_id, (lang) => meetingRequestEmail(cleanerProfile?.display_name ?? "", lang));
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
  if (findBannedWord(text, await getBannedWords())) return { ok: false, error: "banned_word" };
  try {
    const { supabase, userId } = await requireUser();
    if (!rateLimit(`message:${userId}`, 60, 60_000)) return { ok: false, error: "rate_limit" };
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
      const base = await appUrl();
      await notifyUser(otherId, (lang) => newMessageNotice(base, lang));
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
    const { data: req } = await supabase.from("meeting_requests").select("id, household_id, status, cleaner_profiles ( user_id )").eq("id", meetingId).maybeSingle();
    const owner = (req as unknown as { cleaner_profiles: { user_id: string } | null } | null)?.cleaner_profiles?.user_id;
    if (!req || owner !== userId) return { ok: false, error: "not_member" };
    const { error } = await supabase.from("meeting_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", meetingId);
    if (error) return { ok: false, error: "save_failed" };
    // Tell the household (best effort, once per change of answer).
    if (req.household_id && req.status !== status) {
      const base = await appUrl();
      await notifyUser(req.household_id, (lang) => meetingResponseNotice(base, status === "accepted", lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

const slotSchema = z.object({ weekday: z.number().int().min(0).max(6), block: z.enum(["morning", "afternoon", "evening"]) });

/** The cleaner cannot make the requested time and proposes another day and part of day. */
export async function proposeMeetingTime(meetingId: string, weekday: number, block: "morning" | "afternoon" | "evening"): Promise<ChatActionState> {
  const slot = slotSchema.safeParse({ weekday, block });
  if (!slot.success || !/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { supabase, userId } = await requireUser();
    const { data: req } = await supabase.from("meeting_requests").select("id, household_id, status, cleaner_profiles ( user_id )").eq("id", meetingId).maybeSingle();
    const owner = (req as unknown as { cleaner_profiles: { user_id: string } | null } | null)?.cleaner_profiles?.user_id;
    if (!req || owner !== userId) return { ok: false, error: "not_member" };
    if (req.status === "declined") return { ok: false, error: "not_allowed" };
    const { error } = await supabase.from("meeting_requests").update({ status: "rescheduled", proposed_weekday: slot.data.weekday, proposed_block: slot.data.block }).eq("id", meetingId);
    if (error) return { ok: false, error: "save_failed" };
    const base = await appUrl();
    await notifyUser(req.household_id, (lang) => meetingProposalNotice(base, lang));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** The household accepts or declines the time the cleaner proposed. */
export async function answerMeetingProposal(meetingId: string, accept: boolean): Promise<ChatActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("answer_meeting_proposal", { p_request_id: meetingId, p_accept: accept });
    if (error) return { ok: false, error: "save_failed" };
    const res = (data ?? {}) as { result?: string; cleaner_user_id?: string };
    if (res.result !== "accepted" && res.result !== "declined") return { ok: false, error: "not_allowed" };
    if (res.cleaner_user_id) {
      const base = await appUrl();
      const accepted = res.result === "accepted";
      await notifyUser(res.cleaner_user_id, (lang) => meetingProposalAnsweredNotice(base, accepted, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** The household withdraws its own open meeting request. */
export async function withdrawMeeting(meetingId: string): Promise<ChatActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("withdraw_meeting_request", { p_request_id: meetingId });
    if (error) return { ok: false, error: "save_failed" };
    const res = (data ?? {}) as { result?: string; cleaner_user_id?: string };
    if (res.result !== "withdrawn") return { ok: false, error: "not_allowed" };
    if (res.cleaner_user_id) {
      const base = await appUrl();
      await notifyUser(res.cleaner_user_id, (lang) => meetingWithdrawnNotice(base, lang));
    }
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
    // A repeated click (already confirmed / already active) must not send another e-mail.
    const alreadyDone = Boolean(member.conn && member.conn.status !== "ended" && (member.conn.status !== "pending" || member.conn[column]));
    if (member.conn) {
      if (member.conn.status === "ended") {
        // Re-opening after "not a match" or an ended connection: start a fresh pending round.
        const { error } = await supabase
          .from("connections")
          .update({ status: "pending", household_confirmed_at: null, cleaner_confirmed_at: null, started_at: null, ended_at: null, [column]: now })
          .eq("id", member.conn.id);
        if (error) return { ok: false, error: "save_failed" };
        // The old subscription marker (cancelled / stale claim) must not block billing the new round.
        await resetSubscriptionMarker(member.conn.id);
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
    // Tell the other party (best effort): "please confirm too", or "deal confirmed" when this completed it.
    if (!alreadyDone) {
      const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
      const { data: me } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const { data: after } = await supabase
        .from("connections")
        .select("status, household_confirmed_at, cleaner_confirmed_at")
        .eq("household_id", member.conv.household_id)
        .eq("cleaner_id", member.conv.cleaner_id)
        .maybeSingle();
      const both = after?.status === "active" || Boolean(after?.household_confirmed_at && after?.cleaner_confirmed_at);
      const base = await appUrl();
      const myName = me?.display_name ?? "";
      await notifyUser(otherId, (lang) => (both ? dealActiveNotice(myName, base, lang) : dealConfirmedNotice(myName, base, lang)));
    }
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
    const wasActive = member.conn?.status === "active" || member.conn?.status === "paused";
    const alreadyEnded = member.conn?.status === "ended";
    if (member.conn) {
      // Cancel the subscription first: if that fails the connection stays as it is and the caller can simply retry.
      if (!(await cancelMollieSubscription(member.conn.id))) return { ok: false, error: "cancel_failed" };
      const { error } = await supabase.from("connections").update({ status: "ended", ended_at: now }).eq("id", member.conn.id);
      if (error) return { ok: false, error: "save_failed" };
    } else {
      const { error } = await supabase
        .from("connections")
        .insert({ household_id: member.conv.household_id, cleaner_id: member.conv.cleaner_id, status: "ended", ended_at: now });
      if (error) return { ok: false, error: "save_failed" };
    }
    // Tell the other party (best effort).
    if (!alreadyEnded) {
      const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
      const { data: me } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const base = await appUrl();
      await notifyUser(otherId, (lang) => connectionEndedNotice(me?.display_name ?? "", base, wasActive, lang));
    }
    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/account");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * Stop future charges when a connection ends (brief §3.9). Server role only.
 * Returns true when there is nothing (left) to cancel, false when cancelling failed:
 * the subscription id is then left untouched so the call can be retried.
 */
async function cancelMollieSubscription(connectionId: string): Promise<boolean> {
  const mollie = createMollieClient();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!mollie || !serviceKey || !supabaseUrl) return true;
  try {
    const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: conn, error } = await admin.from("connections").select("mollie_customer_id, mollie_subscription_id").eq("id", connectionId).maybeSingle();
    if (error) throw error;
    if (conn?.mollie_customer_id && conn.mollie_subscription_id && conn.mollie_subscription_id.startsWith("sub_")) {
      try {
        await mollie.cancelSubscription(conn.mollie_customer_id, conn.mollie_subscription_id);
      } catch (err) {
        // 404/410: already cancelled at Mollie, only our marker is missing.
        if (!/\((404|410)\)/.test(err instanceof Error ? err.message : "")) throw err;
      }
      const { error: markErr } = await admin.from("connections").update({ mollie_subscription_id: `cancelled:${conn.mollie_subscription_id}` }).eq("id", connectionId);
      if (markErr) throw markErr;
    }
    return true;
  } catch {
    console.warn("cancelMollieSubscription: cancelling failed; connection left unchanged for a retry");
    return false;
  }
}

/** A re-opened connection starts a new billing round: clear a cancelled / stale subscription marker (live 'sub_' ids stay). */
async function resetSubscriptionMarker(connectionId: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return;
  try {
    const admin = createSupabaseAdmin(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: conn } = await admin.from("connections").select("mollie_subscription_id").eq("id", connectionId).maybeSingle();
    const marker = conn?.mollie_subscription_id as string | null | undefined;
    if (marker && !marker.startsWith("sub_")) {
      await admin.from("connections").update({ mollie_subscription_id: null }).eq("id", connectionId).eq("mollie_subscription_id", marker);
    }
  } catch {
    console.warn("resetSubscriptionMarker: reset failed");
  }
}

/**
 * Household sets up payment for an active connection (brief §3.7): a €0.01
 * iDEAL verification creates the SEPA mandate; the webhook then charges the
 * configured household amount and starts the monthly subscription. Businesses
 * are billed month-end instead and cannot start this flow. Returns the Mollie checkout URL.
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
    const { data: bp } = await supabase.from("business_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (bp) return { ok: false, error: "not_for_business" };
    if (member.conn?.status !== "active" && member.conn?.status !== "paused") return { ok: false, error: "not_active" };
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
