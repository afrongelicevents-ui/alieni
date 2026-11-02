"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NavRole } from "@/lib/nav";

/**
 * Role of the signed-in user for navigation purposes (client-side, cached
 * per tab). Pages and data stay protected server-side; this only decides
 * which menu to draw. `null` = not known yet (first paint).
 */
let role: NavRole | null = null;
let started = false;
const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

async function load() {
  const supabase = createClient();
  if (!supabase) { role = "guest"; notify(); return; }
  const { data } = await supabase.auth.getSession();
  if (!data.session) { role = "guest"; notify(); return; }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle();
  const r = profile?.role as NavRole | undefined;
  role = r && r in { household: 1, cleaner: 1, business: 1, admin: 1 } ? r : "household";
  notify();
}

function start() {
  if (started) return;
  started = true;
  void load();
  const supabase = createClient();
  supabase?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load();
  });
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useNavRole(): NavRole | null {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => role, () => null);
}
