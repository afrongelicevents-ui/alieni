import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessDashboard } from "@/components/business/BusinessDashboard";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { ButtonLink } from "@/components/ui/Button";
import { requireRole } from "@/lib/guard";
import { getBusinessForUser } from "@/lib/business-data";
import { getPricingContext } from "@/lib/services";
import { tilesFor } from "@/lib/business-tiles";

export const dynamic = "force-dynamic";

export default async function BusinessDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const user = await requireRole(locale, ["business"], "/business/dashboard", { adminAllowed: false });
  const [bundle, pricing] = await Promise.all([getBusinessForUser(user.id), getPricingContext()]);

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("dashboardTitle")}</h1>
      {bundle ? <BusinessSubnav /> : null}
      <div className="mt-6">
        {!bundle ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="max-w-sm text-ink/70">{t("noAccount")}</p>
            <ButtonLink href="/business/signup" withArrow>{t("heroCta")}</ButtonLink>
          </div>
        ) : (
          <BusinessDashboard bundle={bundle} tiles={tilesFor(pricing.catalog, bundle)} unitPriceCents={bundle.profile.business_type ? pricing.unitPrices[bundle.profile.business_type] ?? null : null} />
        )}
      </div>
    </section>
  );
}
