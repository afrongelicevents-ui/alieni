"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Local demo store for meeting requests and chat, used until Supabase is
 * connected. Shapes mirror the `meeting_requests`, `conversations` and
 * `messages` tables (migration 0002) so swapping in Realtime is mechanical.
 */

export type MeetingType = "in_person" | "video";
export type DayBlockKey = "morning" | "afternoon" | "evening";

export type LocalMessage = {
  id: string;
  from: "me" | "them";
  text: string; // raw text; masking is applied at render time in the demo
  at: string;
};

export type LocalConversation = {
  id: string;
  cleanerId: string;
  meeting?: {
    type: MeetingType;
    weekday: number;
    block: DayBlockKey;
    status: "requested";
  };
  messages: LocalMessage[];
  createdAt: string;
};

const KEY = "alieni.conversations";

/** Labelled sample conversation that demonstrates contact masking. */
const SEED: LocalConversation[] = [
  {
    id: "conv-sample-1",
    cleanerId: "sample-1",
    meeting: { type: "in_person", weekday: 3, block: "morning", status: "requested" },
    createdAt: "2026-10-28T09:00:00.000Z",
    messages: [
      {
        id: "m1",
        from: "me",
        text: "Hoi Sandra! Donderdagochtend kennismaken bij ons thuis, lukt dat?",
        at: "2026-10-28T09:00:00.000Z",
      },
      {
        id: "m2",
        from: "them",
        text: "Leuk! Donderdag om 9:30 kan ik. Bel me anders even op 0612345678 of mail sandra@voorbeeld.nl",
        at: "2026-10-28T09:12:00.000Z",
      },
      {
        id: "m3",
        from: "me",
        text: "Ik zie je nummer niet — laten we het hier afspreken. Donderdag 9:30 is top!",
        at: "2026-10-28T09:15:00.000Z",
      },
    ],
  },
];

let cacheRaw: string | null | undefined;
let cache: LocalConversation[] = SEED;
const listeners = new Set<() => void>();

function parse(raw: string | null): LocalConversation[] {
  if (!raw) return SEED;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function getSnapshot(): LocalConversation[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

function getServerSnapshot(): LocalConversation[] {
  return SEED;
}

function write(next: LocalConversation[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cacheRaw = undefined;
    cache = next;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useConversations() {
  const conversations = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const sendMessage = useCallback((conversationId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const current = getSnapshot();
    write(
      current.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: `m-${Date.now()}`,
                  from: "me" as const,
                  text: trimmed.slice(0, 4000),
                  at: new Date().toISOString(),
                },
              ],
            }
          : c,
      ),
    );
  }, []);

  const requestMeeting = useCallback(
    (cleanerId: string, type: MeetingType, weekday: number, block: DayBlockKey, firstMessage: string) => {
      const current = getSnapshot();
      const existing = current.find((c) => c.cleanerId === cleanerId);
      if (existing) {
        write(
          current.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  meeting: { type, weekday, block, status: "requested" as const },
                  messages: firstMessage.trim()
                    ? [
                        ...c.messages,
                        { id: `m-${Date.now()}`, from: "me" as const, text: firstMessage.trim(), at: new Date().toISOString() },
                      ]
                    : c.messages,
                }
              : c,
          ),
        );
        return existing.id;
      }
      const id = `conv-${Date.now()}`;
      const conversation: LocalConversation = {
        id,
        cleanerId,
        meeting: { type, weekday, block, status: "requested" },
        createdAt: new Date().toISOString(),
        messages: firstMessage.trim()
          ? [{ id: `m-${Date.now()}`, from: "me", text: firstMessage.trim(), at: new Date().toISOString() }]
          : [],
      };
      write([...current, conversation]);
      return id;
    },
    [],
  );

  return { conversations, hydrated, sendMessage, requestMeeting };
}
