import "server-only";
import { redirect } from "next/navigation";
import { requireRole } from "./guard";
import { getBusinessForUser, type BusinessBundle } from "./business-data";

/** Business sub-pages: business role required; without a company profile yet → sign-up. */
export async function loadBusinessPage(locale: string, next: string): Promise<{ userId: string; bundle: BusinessBundle }> {
  const user = await requireRole(locale, ["business"], next);
  const bundle = await getBusinessForUser(user.id);
  if (!bundle) redirect(`/${locale}/business/signup`);
  return { userId: user.id, bundle };
}
