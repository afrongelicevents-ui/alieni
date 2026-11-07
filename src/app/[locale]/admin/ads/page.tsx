import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listAds } from "@/lib/admin/data";
import { formatHourlyRate } from "@/lib/money";
import { AdStatusButtons } from "@/components/admin/AdStatusButtons";

export const dynamic = "force-dynamic";

export default async function AdminAdsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { ads, demo } = await listAds();

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("tabAds")}</h2>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colCity")}</th>
              <th className="px-4 py-3">{t("colRate")}</th>
              <th className="px-4 py-3">{t("colJobs")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ads.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink/70">{t("listEmpty")}</td></tr>
            ) : null}
            {ads.map((ad) => (
              <tr key={ad.id}>
                <td className="px-4 py-3 font-semibold text-ink">{ad.name}</td>
                <td className="px-4 py-3">{ad.city}</td>
                <td className="px-4 py-3">{formatHourlyRate(ad.rateCents, lang)}</td>
                <td className="px-4 py-3">{ad.verifiedJobs}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ad.status === "published" ? "bg-mint text-forest" : ad.status === "removed" ? "bg-red-100 text-red-800" : "bg-section text-ink/70"}`}>
                    {t(`ad_${ad.status}` as "ad_published")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/cleaners/${ad.id}`} className="text-xs font-bold text-forest underline">{t("view")}</Link>
                    {!demo ? <AdStatusButtons adId={ad.id} status={ad.status} /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
