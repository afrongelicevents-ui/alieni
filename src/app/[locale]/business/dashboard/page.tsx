import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessDashboard } from "@/components/business/BusinessDashboard";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { ButtonLink } from "@/components/ui/Button";
import { getSessionUser } from "@/lib/auth";
import { getBusinessForUser } from "@/lib/business-data";

export const dynamic = "force-dynamic";

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const user = await getSessionUser();
  const bundle = user ? await getBusinessForUser(user.id) : null;

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("dashboardTitle")}</h1>
      <div className="mt-6">
        {!user ? (
          <LoginPrompt next="/business/dashboard" />
        ) : !bundle ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="max-w-sm text-ink/70">{t("noAccount")}</p>
            <ButtonLink href="/business/signup" withArrow>{t("heroCta")}</ButtonLink>
          </div>
        ) : (
          <BusinessDashboard bundle={bundle} />
        )}
      </div>
    </section>
  );
}
