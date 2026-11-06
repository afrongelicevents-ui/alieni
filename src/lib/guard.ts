import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type Role, type SessionUser } from "./auth";

/** Where each role lands after login and when it opens a page that is not theirs. */
export function homeFor(role: Role): string {
  switch (role) {
    case "cleaner":
      return "/home";
    case "business":
      return "/business/dashboard";
    case "admin":
      return "/admin";
    default:
      return "/home";
  }
}

/**
 * Server-side route guard. Signed out → login with a return path.
 * Wrong role → that role's own home. Admin may open everything unless the page
 * is role-specific (`{ adminAllowed: false }`): admin then goes to /admin.
 * The database policies are the real boundary; this keeps the experience clean.
 */
export async function requireRole(locale: string, allowed: Role[], next: string, opts: { adminAllowed?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  if (user.role === "admin" ? opts.adminAllowed === false && !allowed.includes("admin") : !allowed.includes(user.role)) redirect(`/${locale}${homeFor(user.role)}`);
  return user;
}

/**
 * For the login, signup and reset-password pages: someone who is already signed in
 * goes to their own home (or the same-site `next` path they were heading for; admin always to /admin).
 */
export async function redirectIfSignedIn(locale: string, next?: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
  redirect(`/${locale}${user.role !== "admin" && safe ? safe : homeFor(user.role)}`);
}
