import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { BusinessTypeCard } from "@/components/business/BusinessTypeCard";
import { getPricingContext } from "@/lib/services";
import { startingQuote } from "@/lib/business-pricing";
import { BUSINESS_TYPE_KEYS } from "@/lib/business";

/** Prices and the service catalogue come from the database on every request (no stale prices). */
export const dynamic = "force-dynamic";

export default async function BusinessLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { unitPrices, businessPricing } = await getPricingContext();
  const t = await getTranslations("business");

  const steps = [
    { title: t("how1Title"), text: t("how1Text") },
    { title: t("how2Title"), text: t("how2Text") },
    { title: t("how3Title"), text: t("how3Text") },
  ];

  return (
    <div>
      <section className="bg-section">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <p className="text-xs font-bold uppercase tracking-wide text-forest">{t("eyebrow")}</p>
          <h1 className="headline mt-2 max-w-2xl text-4xl text-ink sm:text-5xl">{t("heroTitle")}</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/75">{t("heroText")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/business/signup" withArrow>
              {t("heroCta")}
            </ButtonLink>
            <ButtonLink href="/search" variant="secondary">
              {t("browseCleaners")}
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm font-semibold text-forest">{t("noCommission")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="headline text-2xl text-ink sm:text-3xl">{t("typesTitle")}</h2>
        <p className="mt-2 text-ink/70">{t("typesText")}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_TYPE_KEYS.map((type) => (
            <li key={type}>
              <Link href={`/business/${type}`} className="block h-full">
                <BusinessTypeCard type={type} quote={startingQuote(businessPricing, type, unitPrices)} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink/70">{t("pricesNote")}</p>
      </section>

      <section className="bg-section">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="headline text-2xl text-ink sm:text-3xl">{t("howTitle")}</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sun text-lg font-extrabold text-white">
                  {i + 1}
                </span>
                <h3 className="text-lg font-extrabold text-ink">{step.title}</h3>
                <p className="text-sm text-ink/70">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-card-lg bg-forest p-6 text-white">
            <h3 className="headline text-xl">{t("billingTitle")}</h3>
            <p className="mt-2 text-sm text-white/85">{t("billingText")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
