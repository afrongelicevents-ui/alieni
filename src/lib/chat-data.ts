import "server-only";
import { createClient } from "./supabase/server";
import { profilePhotoUrl } from "./cleaners-live";

/**
 * Conversations, messages, meeting requests and connections for the signed-in
 * user. Every query runs with the user's session, so RLS limits it to
 * conversations they are part of.
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
  } | null;
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

function connStatus(row: { status: string; household_confirmed_at: string | null; cleaner_confirmed_at: string | null } | null | undefined): ConnectionStatus {
  if (!row) return "none";
  if (row.status === "active" || row.status === "paused") return "active";
  if (row.status === "ended") return "ended";
  return "pending";
}

export async function listConversations(userId: string): Promise<ConversationSummary[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("id, household_id, cleaner_id, meeting_request_id, last_message_at, created_at")
    .or(`household_id.eq.${userId},cleaner_id.eq.${userId}`)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error || !convs) return [];
  const rows = convs as ConvRow[];
  if (rows.length === 0) return [];

  const otherIds = [...new Set(rows.map((c) => (c.household_id === userId ? c.cleaner_id : c.household_id)))];
  const [{ data: profiles }, { data: cleanerProfiles }, { data: connections }, { data: lastMessages }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", otherIds),
    supabase.from("cleaner_profiles").select("id, user_id, photo_path").in("user_id", otherIds),
    supabase.from("connections").select("household_id, cleaner_id, status, household_confirmed_at, cleaner_confirmed_at").or(`household_id.eq.${userId},cleaner_id.eq.${userId}`),
    supabase.from("messages").select("conversation_id, body, created_at").in("conversation_id", rows.map((c) => c.id)).order("created_at", { ascending: false }).limit(400),
  ]);
  const nameOf = new Map((profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]));
  const cleanerOf = new Map((cleanerProfiles ?? []).map((c: { id: string; user_id: string; photo_path: string | null }) => [c.user_id, c]));
  const lastOf = new Map<string, { body: string; created_at: string }>();
  for (const m of (lastMessages ?? []) as { conversation_id: string; body: string; created_at: string }[]) {
    if (!lastOf.has(m.conversation_id)) lastOf.set(m.conversation_id, m);
  }

  return rows.map((c) => {
    const role = c.household_id === userId ? "household" : "cleaner";
    const otherId = role === "household" ? c.cleaner_id : c.household_id;
    const cp = cleanerOf.get(c.cleaner_id);
    const conn = (connections ?? []).find((k: { household_id: string; cleaner_id: string }) => k.household_id === c.household_id && k.cleaner_id === c.cleaner_id);
    const last = lastOf.get(c.id);
    return {
      id: c.id,
      role,
      otherName: nameOf.get(otherId) ?? "—",
      otherPhoto: role === "household" ? profilePhotoUrl(cp?.photo_path) : null,
      cleanerProfileId: cp?.id ?? null,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.created_at ?? c.last_message_at,
      connection: connStatus(conn),
    };
  });
}

export async function getConversation(id: string, userId: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: c } = await supabase
    .from("conversations")
    .select("id, household_id, cleaner_id, meeting_request_id, last_message_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  const conv = c as ConvRow;
  // RLS already limits rows to members; keep an explicit check as defence in depth.
  if (conv.household_id !== userId && conv.cleaner_id !== userId) return null;
  const role = conv.household_id === userId ? "household" : "cleaner";
  const otherId = role === "household" ? conv.cleaner_id : conv.household_id;

  const [{ data: other }, { data: cp }, { data: meeting }, { data: conn }, { data: msgs }] = await Promise.all([
    supabase.from("profiles").select("display_name, city").eq("id", otherId).maybeSingle(),
    supabase.from("cleaner_profiles").select("id, rate_cents, photo_path, profiles ( city )").eq("user_id", conv.cleaner_id).maybeSingle(),
    conv.meeting_request_id
      ? supabase.from("meeting_requests").select("id, type, proposed_weekday, proposed_block, status").eq("id", conv.meeting_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("connections").select("id, status, household_confirmed_at, cleaner_confirmed_at, started_at, ended_at").eq("household_id", conv.household_id).eq("cleaner_id", conv.cleaner_id).maybeSingle(),
    supabase.from("messages").select("id, sender_id, body, masked, created_at").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(500),
  ]);

  const cleanerRow = cp as { id: string; rate_cents: number; photo_path: string | null; profiles: { city: string | null } | null } | null;
  return {
    id: conv.id,
    role,
    myId: userId,
    otherId,
    otherName: (other as { display_name: string } | null)?.display_name ?? "—",
    otherPhoto: role === "household" ? profilePhotoUrl(cleanerRow?.photo_path) : null,
    cleaner: cleanerRow ? { profileId: cleanerRow.id, rateCents: cleanerRow.rate_cents, city: cleanerRow.profiles?.city ?? "" } : null,
    meeting: meeting
      ? { id: meeting.id, type: meeting.type, weekday: meeting.proposed_weekday, block: meeting.proposed_block, status: meeting.status }
      : null,
    connection: conn
      ? { id: conn.id, status: connStatus(conn), householdConfirmedAt: conn.household_confirmed_at, cleanerConfirmedAt: conn.cleaner_confirmed_at, startedAt: conn.started_at, endedAt: conn.ended_at }
      : null,
    messages: ((msgs ?? []) as { id: string; sender_id: string; body: string; masked: boolean; created_at: string }[]).map((m) => ({
      id: m.id,
      mine: m.sender_id === userId,
      body: m.body,
      masked: m.masked,
      at: m.created_at,
    })),
  };
}
