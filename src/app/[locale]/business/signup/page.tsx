import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessSignup } from "@/components/business/BusinessSignup";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";
import { getSessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/guard";
import { ButtonLink } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getPricingContext } from "@/lib/services";
import { getSignupsPaused } from "@/lib/website-settings";

export const dynamic = "force-dynamic";

export default async function BusinessSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { type } = await searchParams;
  const t = await getTranslations("business");
  const initialType = BUSINESS_TYPE_KEYS.includes(type as BusinessType) ? (type as BusinessType) : undefined;

  const [user, pricing] = await Promise.all([getSessionUser(), getPricingContext()]);
  if (user) {
    if (user.role === "admin") redirect(`/${locale}${homeFor("admin")}`);
    if (user.role !== "business") {
      // a household or cleaner account cannot become a business: say so instead of a silent redirect
      return (
        <section className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="headline text-3xl text-ink">{t("signupTitle")}</h1>
          <div className="mt-6 flex flex-col items-center gap-4 rounded-card-lg border border-line bg-white px-6 py-12 text-center">
            <p role="status" className="max-w-sm text-ink/70">{t(`signupWrongRole_${user.role}` as "signupWrongRole_household")}</p>
            <ButtonLink href={homeFor(user.role)} withArrow>{t("signupWrongRoleCta")}</ButtonLink>
          </div>
        </section>
      );
    }
    const supabase = await createClient();
    const { data: existing } = await supabase!.from("business_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (existing) redirect(`/${locale}/business/dashboard`);
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("signupTitle")}</h1>
      <p className="mt-2 text-ink/70">{t("signupIntro")}</p>
      <div className="mt-6">
        <BusinessSignup initialType={initialType} signedIn={Boolean(user)} email={user?.email} unitPrices={pricing.unitPrices} businessPricing={pricing.businessPricing} signupsPaused={user ? false : await getSignupsPaused()} />
      </div>
    </section>
  );
}
