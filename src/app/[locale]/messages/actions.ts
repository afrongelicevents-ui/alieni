"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { maskContacts } from "@/lib/masking";

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
    const { supabase } = await requireUser();
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
