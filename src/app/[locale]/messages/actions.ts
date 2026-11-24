"use server";

import { findBannedWord, getBannedWords } from "@/lib/site-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCode, requireUser } from "@/lib/auth";
import { maskContacts } from "@/lib/masking";
import { meetingRequestEmail } from "@/lib/email";
import { all, batch, first, nowIso, rateLimit, run, uuid } from "@/lib/server/db";
import { weekdayToDb } from "@/lib/server/chat/weekday";
import { conversationMessages, type ChatMessage } from "@/lib/chat-data";
import { appBaseUrl as appUrl, meetingProposalAnsweredNotice, meetingProposalNotice, meetingWithdrawnNotice, connectionEndedNotice, dealActiveNotice, dealConfirmedNotice, meetingResponseNotice, newMessageNotice, notifyUser } from "@/lib/notify";

export type ChatActionState = { ok: boolean; error?: string; conversationId?: string };

const UUID = /^[0-9a-f-]{36}$/i;

const meetingSchema = z.object({
  cleanerProfileId: z.string().uuid(),
  type: z.enum(["in_person", "video"]),
  weekday: z.number().int().min(0).max(6),
  block: z.enum(["morning", "afternoon", "evening"]),
  message: z.string().trim().max(500),
});

/** The household withdraws an open request (recorded as declined). Returns the cleaner's user id, or null when not allowed. */
async function withdrawOwnRequest(requestId: string, householdId: string): Promise<{ cleanerUserId: string | null } | null> {
  const r = await first<{ id: string; status: string; cleaner_user_id: string | null }>(
    `SELECT mr.id, mr.status, cp.user_id AS cleaner_user_id FROM meeting_requests mr
       LEFT JOIN cleaner_profiles cp ON cp.id = mr.cleaner_profile_id
      WHERE mr.id = ? AND mr.household_id = ?`, requestId, householdId);
  if (!r || !["requested", "accepted", "rescheduled"].includes(r.status)) return null;
  await run("UPDATE meeting_requests SET status = 'declined', responded_at = ? WHERE id = ? AND household_id = ?", nowIso(), r.id, householdId);
  return { cleanerUserId: r.cleaner_user_id };
}

/** Household (or business) asks a cleaner for a meeting: request + conversation + first message. */
export async function requestMeeting(input: z.input<typeof meetingSchema>): Promise<ChatActionState> {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "cleanerProfileId") ? "sample_subject" : "invalid" };
  const m = parsed.data;
  try {
    const { userId, role } = await requireUser();
    // only customers ask for meetings (as the favourites / meeting_requests policies on alieni-nl)
    if (role !== "household" && role !== "business") return { ok: false, error: "not_allowed" };
    if (!(await rateLimit(`meeting:${userId}`, 10, 60 * 60))) return { ok: false, error: "rate_limit" };
    const cleaner = await first<{ id: string; user_id: string; status: string; work_scope: string | null }>(
      "SELECT id, user_id, status, work_scope FROM cleaner_profiles WHERE id = ?", m.cleanerProfileId);
    if (!cleaner || cleaner.status !== "published") return { ok: false, error: "not_available" };
    if (cleaner.user_id === userId) return { ok: false, error: "own_ad" };
    // a cleaner who works only for households (or only for businesses) is not offered to the other side
    const asker = await first("SELECT id FROM business_profiles WHERE user_id = ?", userId);
    const scope = cleaner.work_scope ?? "household";
    if (scope !== "both" && !(asker ? scope === "commercial" : scope === "household")) return { ok: false, error: "not_available" };

    // an earlier open request to the same cleaner is replaced by this one (it is recorded as withdrawn)
    const open = await all<{ id: string }>(
      "SELECT id FROM meeting_requests WHERE household_id = ? AND cleaner_profile_id = ? AND status IN ('requested','accepted','rescheduled')",
      userId, cleaner.id);
    for (const o of open) await withdrawOwnRequest(o.id, userId);

    const now = nowIso();
    const requestId = uuid();
    const existing = await first<{ id: string }>("SELECT id FROM conversations WHERE household_id = ? AND cleaner_id = ?", userId, cleaner.user_id);
    const conversationId = existing?.id ?? uuid();
    const statements: [string, ...(string | number | null)[]][] = [
      ["INSERT INTO meeting_requests (id, household_id, cleaner_profile_id, type, proposed_weekday, proposed_block, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        requestId, userId, cleaner.id, m.type, weekdayToDb(m.weekday), m.block, m.message ? maskContacts(m.message).text : null, now],
      existing
        ? ["UPDATE conversations SET meeting_request_id = ?, last_message_at = ? WHERE id = ? AND household_id = ?", requestId, now, conversationId, userId]
        : ["INSERT INTO conversations (id, household_id, cleaner_id, meeting_request_id, created_at, last_message_at) VALUES (?, ?, ?, ?, ?, ?)",
          conversationId, userId, cleaner.user_id, requestId, now, now],
    ];
    if (m.message) {
      // contacts stay hidden until both confirm a deal
      statements.push(["INSERT INTO messages (id, conversation_id, sender_id, body, masked, created_at) VALUES (?, ?, ?, ?, 1, ?)",
        uuid(), conversationId, userId, maskContacts(m.message).text, now]);
    }
    await batch(statements);

    // Best-effort e-mail to the cleaner (no message content, brief §7).
    const cleanerProfile = await first<{ display_name: string }>("SELECT display_name FROM profiles WHERE id = ?", cleaner.user_id);
    await notifyUser(cleaner.user_id, (lang) => meetingRequestEmail(cleanerProfile?.display_name ?? "", lang));
    revalidatePath("/", "layout");
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

type Member = {
  conv: { id: string; household_id: string; cleaner_id: string };
  role: "household" | "cleaner";
  conn: { id: string; status: string; household_confirmed_at: string | null; cleaner_confirmed_at: string | null; first_activated_at: string | null } | null;
};

/** The conversation and connection, only when `userId` is one of its two members. */
async function membership(conversationId: string, userId: string): Promise<Member | null> {
  if (!UUID.test(conversationId)) return null;
  const conv = await first<Member["conv"]>("SELECT id, household_id, cleaner_id FROM conversations WHERE id = ?", conversationId);
  if (!conv) return null;
  const role = conv.household_id === userId ? "household" : conv.cleaner_id === userId ? "cleaner" : null;
  if (!role) return null;
  const conn = await first<NonNullable<Member["conn"]>>(
    "SELECT id, status, household_confirmed_at, cleaner_confirmed_at, first_activated_at FROM connections WHERE household_id = ? AND cleaner_id = ?",
    conv.household_id, conv.cleaner_id);
  return { conv, role, conn };
}

/** Send a chat message. Contacts are masked server-side until a connection is active. */
export async function sendMessage(conversationId: string, body: string): Promise<ChatActionState> {
  const text = body.trim();
  if (!text || text.length > 2000) return { ok: false, error: "invalid" };
  if (findBannedWord(text, await getBannedWords())) return { ok: false, error: "banned_word" };
  try {
    const { userId } = await requireUser();
    if (!(await rateLimit(`msg:${userId}`, 30, 60))) return { ok: false, error: "rate_limit" };
    const member = await membership(conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const active = member.conn?.status === "active";
    const stored = active ? text : maskContacts(text).text;
    const now = nowIso();
    const hourAgo = new Date(Date.now() - 60 * 60e3).toISOString();
    const recent = await first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id = ? AND created_at >= ?", conversationId, userId, hourAgo);
    await batch([
      ["INSERT INTO messages (id, conversation_id, sender_id, body, masked, created_at) VALUES (?, ?, ?, ?, ?, ?)", uuid(), conversationId, userId, stored, active ? 0 : 1, now],
      ["UPDATE conversations SET last_message_at = ? WHERE id = ?", now, conversationId],
    ]);
    // Notify the other party at most once per quiet hour (no message content).
    if ((recent?.n ?? 0) === 0) {
      const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
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

/** Polling: messages of one of the user's conversations that are newer than `afterIso` (members only). */
export async function fetchNewMessages(conversationId: string, afterIso: string): Promise<ChatMessage[]> {
  if (!UUID.test(conversationId)) return [];
  const after = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(afterIso) ? afterIso : "1970-01-01T00:00:00.000Z";
  try {
    const { userId } = await requireUser();
    if (!(await rateLimit(`poll:${userId}`, 60, 60))) return [];
    return (await conversationMessages(conversationId, userId, after)) ?? [];
  } catch {
    return [];
  }
}

/** The meeting request with its cleaner's user id, only for that cleaner. */
async function requestForCleaner(meetingId: string, userId: string) {
  if (!UUID.test(meetingId)) return null;
  const req = await first<{ id: string; household_id: string; status: string; cleaner_user_id: string }>(
    `SELECT mr.id, mr.household_id, mr.status, cp.user_id AS cleaner_user_id FROM meeting_requests mr
       JOIN cleaner_profiles cp ON cp.id = mr.cleaner_profile_id WHERE mr.id = ?`, meetingId);
  return req && req.cleaner_user_id === userId ? req : null;
}

/** Cleaner accepts or declines a meeting request. */
export async function respondMeeting(meetingId: string, status: "accepted" | "declined"): Promise<ChatActionState> {
  if (status !== "accepted" && status !== "declined") return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUser();
    const req = await requestForCleaner(meetingId, userId);
    if (!req) return { ok: false, error: "not_member" };
    await run("UPDATE meeting_requests SET status = ?, responded_at = ? WHERE id = ?", status, nowIso(), meetingId);
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
  if (!slot.success || !UUID.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUser();
    const req = await requestForCleaner(meetingId, userId);
    if (!req) return { ok: false, error: "not_member" };
    if (req.status === "declined") return { ok: false, error: "not_allowed" };
    await run("UPDATE meeting_requests SET status = 'rescheduled', proposed_weekday = ?, proposed_block = ? WHERE id = ?",
      weekdayToDb(slot.data.weekday), slot.data.block, meetingId);
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
  if (!UUID.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUser();
    const r = await first<{ id: string; status: string; cleaner_user_id: string | null }>(
      `SELECT mr.id, mr.status, cp.user_id AS cleaner_user_id FROM meeting_requests mr
         LEFT JOIN cleaner_profiles cp ON cp.id = mr.cleaner_profile_id
        WHERE mr.id = ? AND mr.household_id = ?`, meetingId, userId);
    if (!r || r.status !== "rescheduled") return { ok: false, error: "not_allowed" };
    await run("UPDATE meeting_requests SET status = ?, responded_at = ? WHERE id = ? AND household_id = ?",
      accept ? "accepted" : "declined", nowIso(), meetingId, userId);
    if (r.cleaner_user_id) {
      const base = await appUrl();
      const cleanerUserId = r.cleaner_user_id;
      await notifyUser(cleanerUserId, (lang) => meetingProposalAnsweredNotice(base, accept, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** The household withdraws its own open meeting request. */
export async function withdrawMeeting(meetingId: string): Promise<ChatActionState> {
  if (!UUID.test(meetingId)) return { ok: false, error: "invalid" };
  try {
    const { userId } = await requireUser();
    const res = await withdrawOwnRequest(meetingId, userId);
    if (!res) return { ok: false, error: "not_allowed" };
    if (res.cleanerUserId) {
      const base = await appUrl();
      const cleanerUserId = res.cleanerUserId;
      await notifyUser(cleanerUserId, (lang) => meetingWithdrawnNotice(base, lang));
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/**
 * "We have a deal": each party confirms its OWN column; when both did, the connection becomes active
 * (and the cleaner's trust counter goes up once per connection), as the alieni-nl database triggers did.
 */
export async function confirmDeal(conversationId: string): Promise<ChatActionState> {
  try {
    const { userId } = await requireUser();
    const member = await membership(conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const mine = member.role === "household" ? "household_confirmed_at" : "cleaner_confirmed_at";
    const now = nowIso();
    // A repeated click (already confirmed / already active) must not send another e-mail.
    const alreadyDone = Boolean(member.conn && member.conn.status !== "ended" && (member.conn.status !== "pending" || member.conn[mine]));
    let householdAt: string | null;
    let cleanerAt: string | null;
    let connId: string;
    let firstActivated = member.conn?.first_activated_at ?? null;
    if (member.conn && member.conn.status !== "ended") {
      connId = member.conn.id;
      householdAt = member.role === "household" ? (member.conn.household_confirmed_at ?? now) : member.conn.household_confirmed_at;
      cleanerAt = member.role === "cleaner" ? (member.conn.cleaner_confirmed_at ?? now) : member.conn.cleaner_confirmed_at;
    } else {
      // new, or re-opening after "not a match" / an ended connection: a fresh round with only the caller's confirmation
      connId = member.conn?.id ?? uuid();
      householdAt = member.role === "household" ? now : null;
      cleanerAt = member.role === "cleaner" ? now : null;
    }
    const wasActive = member.conn?.status === "active";
    const both = Boolean(householdAt && cleanerAt);
    const status = both ? "active" : "pending";
    const startedNow = both && !wasActive;
    const countTrust = startedNow && !firstActivated;
    if (countTrust) firstActivated = now;

    const statements: [string, ...(string | number | null)[]][] = [];
    if (member.conn) {
      statements.push([
        `UPDATE connections SET status = ?, household_confirmed_at = ?, cleaner_confirmed_at = ?,
            started_at = CASE WHEN ? = 1 THEN ? WHEN ? = 'pending' THEN NULL ELSE started_at END,
            ended_at = NULL, first_activated_at = ?
          WHERE id = ? AND household_id = ? AND cleaner_id = ?`,
        status, householdAt, cleanerAt, startedNow ? 1 : 0, now, status, firstActivated, connId, member.conv.household_id, member.conv.cleaner_id]);
    } else {
      statements.push([
        `INSERT INTO connections (id, household_id, cleaner_id, status, household_confirmed_at, cleaner_confirmed_at, started_at, first_activated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        connId, member.conv.household_id, member.conv.cleaner_id, status, householdAt, cleanerAt, startedNow ? now : null, firstActivated, now]);
    }
    if (countTrust) {
      statements.push(["UPDATE cleaner_profiles SET verified_jobs_count = verified_jobs_count + 1 WHERE user_id = ?", member.conv.cleaner_id]);
    }
    await batch(statements);

    // Tell the other party (best effort): "please confirm too", or "deal confirmed" when this completed it.
    if (!alreadyDone) {
      const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
      const me = await first<{ display_name: string }>("SELECT display_name FROM profiles WHERE id = ?", userId);
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

/** "Not a match" or ending an active connection (nothing is charged: payments are off). */
export async function endConnection(conversationId: string): Promise<ChatActionState> {
  try {
    const { userId } = await requireUser();
    const member = await membership(conversationId, userId);
    if (!member) return { ok: false, error: "not_member" };
    const now = nowIso();
    const wasActive = member.conn?.status === "active";
    const alreadyEnded = member.conn?.status === "ended";
    if (member.conn) {
      await run("UPDATE connections SET status = 'ended', ended_at = COALESCE(ended_at, ?) WHERE id = ? AND household_id = ? AND cleaner_id = ?",
        now, member.conn.id, member.conv.household_id, member.conv.cleaner_id);
    } else {
      await run("INSERT INTO connections (id, household_id, cleaner_id, status, ended_at, created_at) VALUES (?, ?, ?, 'ended', ?, ?)",
        uuid(), member.conv.household_id, member.conv.cleaner_id, now, now);
    }
    // Tell the other party (best effort).
    if (!alreadyEnded) {
      const otherId = member.role === "household" ? member.conv.cleaner_id : member.conv.household_id;
      const me = await first<{ display_name: string }>("SELECT display_name FROM profiles WHERE id = ?", userId);
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

/** Payments are off on this version: there is no payment step. Kept so the deal panel's button stays wired. */
export async function setupHouseholdPayment(conversationId: string): Promise<ChatActionState & { checkoutUrl?: string }> {
  void conversationId;
  return { ok: false, error: "payments_not_configured" };
}
