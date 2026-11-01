"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Favourites, stored locally until accounts are live — then this moves to
 * the `favourites` table in Supabase (same id-based shape).
 */
const KEY = "alieni.favourites";
const EMPTY: string[] = [];

let cacheRaw: string | null | undefined;
let cache: string[] = EMPTY;
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

function getSnapshot(): string[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function notify() {
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

export function useFavourites() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const toggle = useCallback((id: string) => {
    const current = getSnapshot();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — favourites live only in memory this session
      cacheRaw = undefined;
      cache = next;
    }
    notify();
  }, []);

  return { ids, loaded, toggle, has: (id: string) => ids.includes(id) };
}
