import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAdminOverview } from "@/lib/admin/data";
import { formatEuro } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { kpis, openReports, meetingsThisMonth, newAdsThisMonth, pendingVog } = await getAdminOverview();

  const cards = [
    { label: t("kpiRevenueGross"), value: formatEuro(kpis.revenueGrossCents, lang) },
    { label: t("kpiRevenueNet"), value: formatEuro(kpis.revenueNetCents, lang) },
    { label: t("kpiBtw"), value: formatEuro(kpis.revenueBtwCents, lang) },
    { label: t("kpiActiveConnections"), value: String(kpis.activeConnections) },
    { label: t("kpiMeetings"), value: String(meetingsThisMonth) },
    { label: t("kpiNewAds"), value: String(newAdsThisMonth) },
    { label: t("kpiChurn"), value: `${kpis.churnPct}%` },
  ];
  const needs = openReports + pendingVog;

  return (
    <div>
      <Link href={openReports > 0 || pendingVog === 0 ? "/admin/reports" : "/admin/vog"} className="flex items-center justify-between rounded-card-lg border-2 border-sun bg-sun/15 p-5 transition-colors hover:bg-sun/25">
        <div>
          <h2 className="font-extrabold text-ink">{t("needsYou")}</h2>
          <p className="text-sm text-ink/70">
            {t("needsYouText", { count: openReports })}
            {pendingVog > 0 ? ` · ${t("pendingVogText", { count: pendingVog })}` : ""}
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun text-lg font-extrabold text-ink">{needs}</span>
      </Link>

      <h2 className="headline mt-8 text-xl text-ink">{t("kpiTitle")}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-card-lg border border-line bg-white p-4">
            <dt className="text-xs font-semibold text-ink/70">{card.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-ink">{card.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-xs text-ink/70">{t("autoNote")}</p>
    </div>
  );
}
