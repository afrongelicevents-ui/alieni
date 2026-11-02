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
 * Wrong role → that role's own home. Admin may open everything.
 * The database policies are the real boundary; this keeps the experience clean.
 */
export async function requireRole(locale: string, allowed: Role[], next: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  if (user.role !== "admin" && !allowed.includes(user.role)) redirect(`/${locale}${homeFor(user.role)}`);
  return user;
}
