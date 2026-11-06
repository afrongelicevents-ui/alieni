import "server-only";
import { createClient } from "./supabase/server";

export type Role = "household" | "cleaner" | "business" | "admin";
export type SessionUser = { id: string; email: string; role: Role; displayName: string };

/**
 * Current signed-in user with their profile role, or null.
 * Server components and server actions only.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    role: (profile?.role as Role) ?? "household",
    displayName: profile?.display_name ?? data.user.email?.split("@")[0] ?? "",
  };
}

/** Supabase client + user for a server action; throws a typed error code when signed out. */
export async function requireUser() {
  const supabase = await createClient();
  if (!supabase) throw new Error("not_configured");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("not_signed_in");
  return { supabase, userId: data.user.id, email: data.user.email ?? "" };
}

/** Typed error code for UIs (`t("error_" + code)`); anything that is not a snake_case code becomes "failed". */
export function errorCode(err: unknown): string {
  return err instanceof Error && /^[a-z][a-z0-9_]*$/.test(err.message) ? err.message : "failed";
}
