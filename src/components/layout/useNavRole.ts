"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { NavRole } from "@/lib/nav";

/**
 * Role of the signed-in user for navigation purposes (client-side, cached per tab). Pages and data stay
 * protected server-side; this only decides which menu to draw. The server passes the role it already knows as
 * the initial value, so a signed-in user never sees the wrong menu on first paint; `null` = not known.
 */
let role: NavRole | null = null;
let started = false;
const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

export async function refreshNavRole() {
  try {
    const res = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return;
    const { role: r } = (await res.json()) as { role?: string };
    if (r && r in { guest: 1, household: 1, cleaner: 1, business: 1, admin: 1 }) { role = r as NavRole; notify(); }
  } catch {
    // keep what is known
  }
}

function start() {
  if (started) return;
  started = true;
  void refreshNavRole();
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useNavRole(initial: NavRole | null = null): NavRole | null {
  useEffect(start, []);
  const current = useSyncExternalStore(subscribe, () => role, () => null);
  return current ?? initial;
}
