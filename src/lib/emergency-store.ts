"use client";

import { useCallback, useSyncExternalStore } from "react";
import { acceptRequest, expireIfDue, type EmergencyRequest } from "./emergency";

/** Local demo store for emergency requests, mirroring emergency_requests. */
export type LocalEmergency = EmergencyRequest & {
  postcode: string;
  city: string;
  addressLine: string;
  tasks: string;
  createdAt: string;
};

const KEY = "alieni.emergency";
const EMPTY: LocalEmergency[] = [];
let cacheRaw: string | null | undefined;
let cache: LocalEmergency[] = EMPTY;
const listeners = new Set<() => void>();

function parse(raw: string | null): LocalEmergency[] {
  if (!raw) return EMPTY;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : EMPTY;
  } catch {
    return EMPTY;
  }
}
function getSnapshot(): LocalEmergency[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw).map((r) => expireIfDue(r, new Date()) as LocalEmergency);
  }
  return cache;
}
function write(next: LocalEmergency[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cacheRaw = undefined;
    cache = next;
  }
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
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

export function useEmergency() {
  const requests = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  const create = useCallback((input: Omit<LocalEmergency, "id" | "status" | "acceptedBy" | "acceptedAt" | "feeCents" | "createdAt">) => {
    const current = getSnapshot();
    const req: LocalEmergency = { ...input, id: `em-${Date.now()}`, status: "searching", acceptedBy: null, acceptedAt: null, feeCents: null, createdAt: new Date().toISOString() };
    write([req, ...current]);
    return req.id;
  }, []);

  const accept = useCallback((id: string, cleanerId: string) => {
    const current = getSnapshot();
    let ok = false;
    write(current.map((r) => {
      if (r.id !== id) return r;
      const next = acceptRequest(r, cleanerId, new Date());
      if (next) ok = true;
      return (next ?? r) as LocalEmergency;
    }));
    return ok;
  }, []);

  const cancel = useCallback((id: string) => {
    const current = getSnapshot();
    write(current.map((r) => (r.id === id && r.status === "searching" ? { ...r, status: "cancelled" as const } : r)));
  }, []);

  return { requests, hydrated, create, accept, cancel };
}
