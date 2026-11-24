import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./server/auth-config";
import { first } from "./server/db";

export type Role = "household" | "cleaner" | "business" | "admin";
export type SessionUser = { id: string; email: string; role: Role; displayName: string; twoFactorEnabled: boolean; emailVerified: boolean };

type ProfileRow = { role: Role; display_name: string; suspended_at: string | null };

/**
 * Current signed-in user with their profile role, or null.
 * Reads the Better Auth session (D1) from the request cookies; a suspended account counts as signed out.
 * Server components, route handlers and server actions only.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const auth = await getAuth();
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s?.user) return null;
    const p = await first<ProfileRow>("SELECT role, display_name, suspended_at FROM profiles WHERE id = ?", s.user.id);
    if (!p || p.suspended_at) return null;
    return {
      id: s.user.id,
      email: s.user.email,
      role: p.role,
      displayName: p.display_name || s.user.email.split("@")[0],
      twoFactorEnabled: Boolean((s.user as { twoFactorEnabled?: unknown }).twoFactorEnabled),
      emailVerified: Boolean(s.user.emailVerified),
    };
  } catch {
    return null;
  }
}

/** The signed-in user for a server action; throws a typed error code when signed out. */
export async function requireUser(): Promise<{ userId: string; email: string; role: Role; user: SessionUser }> {
  const user = await getSessionUser();
  if (!user) throw new Error("not_signed_in");
  return { userId: user.id, email: user.email, role: user.role, user };
}

/** Like requireUser, but only for the given roles (admin must also have two-step login switched on). */
export async function requireUserRole(roles: Role[]): Promise<{ userId: string; email: string; role: Role; user: SessionUser }> {
  const r = await requireUser();
  if (!roles.includes(r.role)) throw new Error("not_allowed");
  if (r.role === "admin" && roles.includes("admin") && !r.user.twoFactorEnabled) throw new Error("two_factor_required");
  return r;
}

/** Admin with two-step login switched on, for admin server actions. */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const r = await requireUserRole(["admin"]);
  return { userId: r.userId, email: r.email };
}

/** Typed error code for UIs (`t("error_" + code)`); anything that is not a snake_case code becomes "failed". */
export function errorCode(err: unknown): string {
  return err instanceof Error && /^[a-z][a-z0-9_]*$/.test(err.message) ? err.message : "failed";
}
