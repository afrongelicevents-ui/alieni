import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { listWorkRecords } from "@/lib/admin/data";
import { SERVICE_LABEL, type ServiceKey } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function AdminWorkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const tb = await getTranslations("business");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { work } = await listWorkRecords();
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("workAdminTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("workAdminIntro")}</p>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-section text-xs font-semibold uppercase text-ink/70">
            <tr><th className="px-3 py-2">{t("colWhen")}</th><th className="px-3 py-2">{t("colBusiness")}</th><th className="px-3 py-2">{t("colCleaner")}</th><th className="px-3 py-2">{t("colService")}</th><th className="px-3 py-2">{t("colOutcome")}</th><th className="px-3 py-2">{t("colConfirmed")}</th><th className="px-3 py-2">{t("colNotes")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {work.length === 0 ? <tr><td colSpan={7} className="px-3 py-4 text-ink/70">{t("workNone")}</td></tr> : work.map((w) => (
              <tr key={w.id} data-admin-work={w.id}>
                <td className="px-3 py-2 whitespace-nowrap">{fmt(w.scheduledStart)}</td>
                <td className="px-3 py-2 font-semibold text-ink">{w.business}</td>
                <td className="px-3 py-2">{w.cleaner}</td>
                <td className="px-3 py-2">{SERVICE_LABEL[w.serviceKey as ServiceKey]?.[lang] ?? w.serviceKey}</td>
                <td className="px-3 py-2">{tb(`outcome_${w.outcome}` as "outcome_done")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmt(w.confirmedAt)}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs">{w.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
