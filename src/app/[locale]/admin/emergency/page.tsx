import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { listEmergencies } from "@/lib/admin/data";

export const dynamic = "force-dynamic";
import { formatEuro } from "@/lib/money";

export default async function AdminEmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { items } = await listEmergencies();

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("emTitle")}</h2>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr><th className="px-4 py-3">{t("colRequester")}</th><th className="px-4 py-3">{t("colCity")}</th><th className="px-4 py-3">{t("colWindow")}</th><th className="px-4 py-3">{t("colStatus")}</th><th className="px-4 py-3">{t("colCleaner")}</th><th className="px-4 py-3 text-right">{t("colFee")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-semibold text-ink">{e.requester} <span className="text-xs font-medium text-ink/70">({t(`role_${e.requesterType}` as "role_household")})</span></td>
                <td className="px-4 py-3">{e.city}</td>
                <td className="px-4 py-3">{e.window}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.status === "accepted" ? "bg-mint text-forest" : e.status === "searching" ? "bg-sun/30 text-ink" : "bg-section text-ink/70"}`}>{t(`em_${e.status}` as "em_searching")}</span></td>
                <td className="px-4 py-3">{e.acceptedBy ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold">{e.feeCents ? formatEuro(e.feeCents, lang) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink/70">{t("emNote")}</p>
    </div>
  );
}
