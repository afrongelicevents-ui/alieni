import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { CalendarSync } from "@/components/business/CalendarSync";
import { loadBusinessPage } from "@/lib/business-page";
import { enabledFor, getCatalog } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Turnover calendar (iCal + manual turnovers) for Airbnb and hotel accounts. */
export default async function BusinessCalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const { bundle } = await loadBusinessPage(locale, "/business/calendar");
  const catalog = await getCatalog();
  const type = bundle.profile.business_type;
  const forType = type === "airbnb" || type === "hotel";
  const enabled = enabledFor(catalog, "turnover", type);
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("calendarTitle")}</h1>
      <BusinessSubnav />
      <div className="mt-5">
        {!forType ? <p className="rounded-card-lg border border-line bg-white p-5 text-sm text-ink/70">{t("calendarNotForType")}</p>
          : !enabled ? <p className="rounded-card-lg border border-line bg-white p-5 text-sm text-ink/70">{t("reqSoon")}</p>
          : <CalendarSync bundle={bundle} />}
      </div>
    </section>
  );
}
