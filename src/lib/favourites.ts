"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createClient } from "./supabase/client";

/**
 * Favourites. Signed in: the `favourites` table (own rows only, RLS).
 * Signed out: this device only (localStorage), so browsing still works.
 */
const KEY = "alieni.favourites";
const EMPTY: string[] = [];

let cacheRaw: string | null | undefined;
let localIds: string[] = EMPTY;
let remoteIds: string[] | null = null; // null = signed out / not loaded
let signedIn: boolean | null = null;
let initialised = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readLocal(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    localIds = parse(raw);
  }
  return localIds;
}

function notify() {
  for (const listener of listeners) listener();
}

async function loadRemote() {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase.from("favourites").select("cleaner_profile_id");
  remoteIds = (data ?? []).map((r: { cleaner_profile_id: string }) => r.cleaner_profile_id);
  notify();
  await mergeLocal(supabase);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hearts given while signed out move into the account on sign-in (example cleaners stay on the device). */
async function mergeLocal(supabase: NonNullable<ReturnType<typeof createClient>>) {
  const local = readLocal().filter((id) => UUID.test(id) && !(remoteIds ?? []).includes(id));
  if (!local.length) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;
  const { error } = await supabase.from("favourites").upsert(local.map((id) => ({ user_id: userId, cleaner_profile_id: id })), { onConflict: "user_id,cleaner_profile_id", ignoreDuplicates: true });
  if (error) return; // not allowed for this account type: keep them on the device
  const { data } = await supabase.from("favourites").select("cleaner_profile_id");
  remoteIds = (data ?? []).map((r: { cleaner_profile_id: string }) => r.cleaner_profile_id);
  writeLocal(readLocal().filter((id) => !UUID.test(id)));
}

function init() {
  if (initialised) return;
  initialised = true;
  const supabase = createClient();
  if (!supabase) {
    signedIn = false;
    return;
  }
  supabase.auth.getSession().then(({ data }) => {
    signedIn = Boolean(data.session);
    if (signedIn) loadRemote();
    else notify();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = Boolean(session);
    if (next !== signedIn) {
      signedIn = next;
      remoteIds = null;
      if (next) loadRemote();
      else notify();
    }
  });
}

let snapshot: { ids: string[]; signedIn: boolean | null } = { ids: EMPTY, signedIn: null };
function getSnapshot() {
  const ids = signedIn && remoteIds ? remoteIds : readLocal();
  if (ids !== snapshot.ids || signedIn !== snapshot.signedIn) snapshot = { ids, signedIn };
  return snapshot;
}
const SERVER_SNAPSHOT = { ids: EMPTY, signedIn: null as boolean | null };
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
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

function writeLocal(next: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cacheRaw = undefined;
    localIds = next;
  }
  notify();
}

export function useFavourites() {
  useEffect(init, []);
  const { ids, signedIn: session } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useSyncExternalStore(subscribe, () => true, () => false);

  const toggle = useCallback(async (id: string) => {
    const current = getSnapshot().ids;
    const adding = !current.includes(id);
    const next = adding ? [...current, id] : current.filter((x) => x !== id);
    const supabase = createClient();
    if (signedIn && supabase) {
      remoteIds = next; // optimistic
      notify();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      const result = adding
        ? await supabase.from("favourites").insert({ user_id: userId, cleaner_profile_id: id })
        : await supabase.from("favourites").delete().eq("cleaner_profile_id", id);
      if (result.error) {
        // e.g. a sample cleaner that is not in the database: keep it on the device.
        remoteIds = current;
        writeLocal(adding ? [...readLocal(), id] : readLocal().filter((x) => x !== id));
      }
      return;
    }
    writeLocal(next);
  }, []);

  return { ids, loaded, signedIn: session, toggle, has: (id: string) => ids.includes(id) };
}
