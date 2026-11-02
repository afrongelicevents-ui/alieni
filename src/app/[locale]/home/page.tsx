import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/guard";
import { CleanerHome } from "@/components/home-role/CleanerHome";
import { HouseholdHome } from "@/components/home-role/HouseholdHome";

export const dynamic = "force-dynamic";

/** The signed-in front door: one dashboard per role. */
export default async function RoleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=/home`);
  if (user.role === "business" || user.role === "admin") redirect(`/${locale}${homeFor(user.role)}`);
  if (user.role === "cleaner") return <CleanerHome user={user} />;
  return <HouseholdHome user={user} />;
}
