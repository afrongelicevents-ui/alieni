import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import CleanerProfilePage from "../../profile/page";

/**
 * "Place your ad": the ad form. Logged-out visitors log in (or sign up) and come straight back here, not to /profile.
 * The form itself is the cleaner profile page; it also decides who may use it (cleaners only).
 */
export default async function NewAdPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ step?: string; edit?: string }>;
}) {
  const { locale } = await props.params;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent("/cleaners/new")}`);
  return CleanerProfilePage(props);
}
