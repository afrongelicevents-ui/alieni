import "server-only";
import { getPublicHouseholdFeeCents } from "./site-settings";
import { all, first } from "./server/db";
import { cleanerPhotoUrl } from "./server/chat/photo";
import { weekdayFromDb } from "./server/chat/weekday";

/**
 * Conversations, messages, meeting requests and connections for the signed-in user.
 * D1 has no row-level security: every query below is limited to conversations the user is a member of
 * (household_id = me OR cleaner_id = me). Admins get no special access to chats.
 */

export type ConnectionStatus = "none" | "pending" | "active" | "ended";

export type ConversationSummary = {
  id: string;
  role: "household" | "cleaner"; // the signed-in user's side of this conversation
  otherName: string;
  otherPhoto: string | null;
  cleanerProfileId: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  connection: ConnectionStatus;
};

export type ChatMessage = { id: string; mine: boolean; body: string; masked: boolean; at: string };

export type ConversationDetail = {
  id: string;
  role: "household" | "cleaner";
  myId: string;
  otherId: string;
  otherName: string;
  otherPhoto: string | null;
  cleaner: { profileId: string; rateCents: number; city: string } | null;
  meeting: { id: string; type: "in_person" | "video"; weekday: number; block: "morning" | "afternoon" | "evening"; status: string } | null;
  connection: {
    id: string;
    status: ConnectionStatus;
    householdConfirmedAt: string | null;
    cleanerConfirmedAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    paymentSetUp: boolean; // always false: payments are off on this version
    paused: boolean;
  } | null;
  /** Payments are off on the Cloudflare version: the household never sees a payment step. */
  paymentsEnabled: boolean;
  /** The monthly household price to show, or null while no price is active (copy stays price-neutral). */
  householdFeeCents: number | null;
  /** The signed-in user is a business: it never sees the household payment prompt. */
  isBusiness: boolean;
  messages: ChatMessage[];
};

type ConvRow = {
  id: string;
  household_id: string;
  cleaner_id: string;
  meeting_request_id: string | null;
  last_message_at: string;
  created_at: string;
};

type ConnRow = { id: string; status: string; household_confirmed_at: string | null; cleaner_confirmed_at: string | null; started_at: string | null; ended_at: string | null };

function connStatus(row: { status: string } | null | undefined): ConnectionStatus {
  if (!row) return "none";
  if (row.status === "active") return "active";
  if (row.status === "ended") return "ended";
  return "pending";
}

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(",");

export async function listConversations(userId: string): Promise<ConversationSummary[] | null> {
  const rows = await all<ConvRow>(
    `SELECT id, household_id, cleaner_id, meeting_request_id, last_message_at, created_at
       FROM conversations WHERE household_id = ? OR cleaner_id = ?
      ORDER BY last_message_at DESC LIMIT 100`,
    userId, userId,
  );
  if (rows.length === 0) return [];

  const otherIds = [...new Set(rows.map((c) => (c.household_id === userId ? c.cleaner_id : c.household_id)))];
  const convIds = rows.map((c) => c.id);
  const [profiles, cleanerProfiles, connections, lastMessages] = await Promise.all([
    all<{ id: string; display_name: string }>(`SELECT id, display_name FROM profiles WHERE id IN (${placeholders(otherIds.length)})`, ...otherIds),
    all<{ id: string; user_id: string; photo_key: string | null }>(`SELECT id, user_id, photo_key FROM cleaner_profiles WHERE user_id IN (${placeholders(otherIds.length)})`, ...otherIds),
    all<{ household_id: string; cleaner_id: string; status: string }>(
      "SELECT household_id, cleaner_id, status FROM connections WHERE household_id = ? OR cleaner_id = ?", userId, userId),
    // last message per conversation (only conversations of this user)
    all<{ conversation_id: string; body: string; created_at: string }>(
      `SELECT m.conversation_id, m.body, m.created_at FROM messages m
        WHERE m.conversation_id IN (${placeholders(convIds.length)})
          AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = m.conversation_id)`,
      ...convIds),
  ]);
  const nameOf = new Map(profiles.map((p) => [p.id, p.display_name]));
  const cleanerOf = new Map(cleanerProfiles.map((c) => [c.user_id, c]));
  const lastOf = new Map<string, { body: string; created_at: string }>();
  for (const m of lastMessages) if (!lastOf.has(m.conversation_id)) lastOf.set(m.conversation_id, m);

  return Promise.all(rows.map(async (c) => {
    const role: "household" | "cleaner" = c.household_id === userId ? "household" : "cleaner";
    const otherId = role === "household" ? c.cleaner_id : c.household_id;
    const cp = cleanerOf.get(c.cleaner_id);
    const conn = connections.find((k) => k.household_id === c.household_id && k.cleaner_id === c.cleaner_id);
    const last = lastOf.get(c.id);
    return {
      id: c.id,
      role,
      otherName: nameOf.get(otherId) ?? "—",
      otherPhoto: role === "household" ? await cleanerPhotoUrl(cp?.photo_key) : null,
      cleanerProfileId: cp?.id ?? null,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.created_at ?? c.last_message_at,
      connection: connStatus(conn),
    };
  }));
}

/** Messages of a conversation the user is a member of (oldest first), optionally only those after `afterIso`. */
export async function conversationMessages(conversationId: string, userId: string, afterIso?: string): Promise<ChatMessage[] | null> {
  const conv = await first<{ household_id: string; cleaner_id: string }>("SELECT household_id, cleaner_id FROM conversations WHERE id = ?", conversationId);
  if (!conv || (conv.household_id !== userId && conv.cleaner_id !== userId)) return null;
  const rows = afterIso
    ? await all<{ id: string; sender_id: string; body: string; masked: number; created_at: string }>(
      "SELECT id, sender_id, body, masked, created_at FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 200",
      conversationId, afterIso)
    : await all<{ id: string; sender_id: string; body: string; masked: number; created_at: string }>(
      `SELECT * FROM (SELECT id, sender_id, body, masked, created_at FROM messages WHERE conversation_id = ?
         ORDER BY created_at DESC LIMIT 500) ORDER BY created_at ASC`,
      conversationId);
  return rows.map((m) => ({ id: m.id, mine: m.sender_id === userId, body: m.body, masked: m.masked === 1, at: m.created_at }));
}

export async function getConversation(id: string, userId: string): Promise<ConversationDetail | null> {
  const conv = await first<ConvRow>(
    "SELECT id, household_id, cleaner_id, meeting_request_id, last_message_at, created_at FROM conversations WHERE id = ?", id);
  if (!conv) return null;
  // members only (no row-level security in D1)
  if (conv.household_id !== userId && conv.cleaner_id !== userId) return null;
  const role: "household" | "cleaner" = conv.household_id === userId ? "household" : "cleaner";
  const otherId = role === "household" ? conv.cleaner_id : conv.household_id;

  const [other, cleanerRow, meeting, conn, messages, bp, householdFeeCents] = await Promise.all([
    first<{ display_name: string }>("SELECT display_name FROM profiles WHERE id = ?", otherId),
    first<{ id: string; rate_cents: number; photo_key: string | null; city: string | null }>(
      `SELECT cp.id, cp.rate_cents, cp.photo_key, p.city FROM cleaner_profiles cp JOIN profiles p ON p.id = cp.user_id WHERE cp.user_id = ?`,
      conv.cleaner_id),
    conv.meeting_request_id
      ? first<{ id: string; type: "in_person" | "video"; proposed_weekday: number; proposed_block: "morning" | "afternoon" | "evening"; status: string }>(
        "SELECT id, type, proposed_weekday, proposed_block, status FROM meeting_requests WHERE id = ? AND household_id = ?",
        conv.meeting_request_id, conv.household_id)
      : Promise.resolve(null),
    first<ConnRow>(
      "SELECT id, status, household_confirmed_at, cleaner_confirmed_at, started_at, ended_at FROM connections WHERE household_id = ? AND cleaner_id = ?",
      conv.household_id, conv.cleaner_id),
    conversationMessages(conv.id, userId),
    first<{ id: string }>("SELECT id FROM business_profiles WHERE user_id = ?", userId),
    getPublicHouseholdFeeCents(),
  ]);

  return {
    id: conv.id,
    role,
    myId: userId,
    otherId,
    otherName: other?.display_name ?? "—",
    otherPhoto: role === "household" ? await cleanerPhotoUrl(cleanerRow?.photo_key) : null,
    cleaner: cleanerRow ? { profileId: cleanerRow.id, rateCents: cleanerRow.rate_cents, city: cleanerRow.city ?? "" } : null,
    meeting: meeting
      ? { id: meeting.id, type: meeting.type, weekday: weekdayFromDb(meeting.proposed_weekday), block: meeting.proposed_block, status: meeting.status }
      : null,
    connection: conn
      ? { id: conn.id, status: connStatus(conn), householdConfirmedAt: conn.household_confirmed_at, cleanerConfirmedAt: conn.cleaner_confirmed_at, startedAt: conn.started_at, endedAt: conn.ended_at, paymentSetUp: false, paused: false }
      : null,
    paymentsEnabled: false,
    householdFeeCents,
    isBusiness: Boolean(bp),
    messages: messages ?? [],
  };
}
