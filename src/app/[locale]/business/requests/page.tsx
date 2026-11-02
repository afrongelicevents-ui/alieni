import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { loadBusinessPage } from "@/lib/business-page";
import { enabledFor, getCatalog, type ServiceKey } from "@/lib/services";

export const dynamic = "force-dynamic";

const chip = (text: string, tone: "open" | "ok" | "muted" | "warn") => (
  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone === "ok" ? "bg-mint text-forest" : tone === "warn" ? "bg-red-100 text-red-800" : tone === "muted" ? "bg-section text-ink/60" : "bg-sun/30 text-ink"}`}>{text}</span>
);

type Labels = { count: (n: number) => string; reqNew: string; soon: string; offNote: (id: string) => string };
function RequestBlock({ id, title, enabled, newHref, count, labels, children }: { id: string; title: string; enabled: boolean; newHref: string; count: number; labels: Labels; children: React.ReactNode }) {
  return (
    <section className="rounded-card-lg border border-line bg-white p-5" data-request-block={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-ink">{title} <span className="text-sm font-semibold text-ink/60">· {labels.count(count)}</span></h2>
        {enabled ? <Link href={newHref} className="rounded-full bg-forest px-4 py-1.5 text-xs font-bold text-white">{labels.reqNew}</Link> : chip(labels.soon, "muted")}
      </div>
      <div className="mt-3">{enabled ? children : <p className="text-sm text-ink/70">{labels.offNote(id)}</p>}</div>
    </section>
  );
}

/** Requests hub: one block per service, each with its own list and status chips. */
export default async function BusinessRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { bundle } = await loadBusinessPage(locale, "/business/requests");
  const catalog = await getCatalog();
  const type = bundle.profile.business_type;
  const on = (s: ServiceKey) => enabledFor(catalog, s, type);
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const slots = bundle.slots.filter((s) => s.status !== "cancelled").slice(0, 12);

  const labels = { count: (n: number) => t("reqCount", { count: n }), reqNew: t("reqNew"), soon: t("tileSoon"), offNote: (id: string) => (catalog.find((c) => c.service_key === id)?.enabled ? t("reqOff") : t("reqSoon")) };

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("requestsTitle")}</h1>
      <BusinessSubnav />
      <p className="mt-4 text-sm text-ink/70">{t("requestsIntro")}</p>
      <div className="mt-5 flex flex-col gap-4">
        <RequestBlock labels={labels} id="cover" title={t("reqCover")} enabled={on("cover")} newHref="/emergency" count={bundle.emergencies.length}>
          {bundle.emergencies.length === 0 ? <p className="text-sm text-ink/70">{t("reqNone")}</p> : (
            <ul className="divide-y divide-line">
              {bundle.emergencies.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-ink">{fmt(e.window_start)} · {e.hours}h · {e.city}</span>
                  {chip(t(`em_${e.status}`), e.status === "accepted" ? "ok" : e.status === "searching" ? "open" : "muted")}
                </li>
              ))}
            </ul>
          )}
        </RequestBlock>
        <RequestBlock labels={labels} id="turnover" title={t("reqTurnovers")} enabled={on("turnover")} newHref="/business/calendar" count={slots.length}>
          {slots.length === 0 ? <p className="text-sm text-ink/70">{t("reqNone")}</p> : (
            <ul className="divide-y divide-line">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-ink">{fmt(s.starts_at)} → {new Date(s.ends_at).toLocaleTimeString(lang === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" })}</span>
                  {chip(t(`slot_${s.status}`), s.status === "done" || s.status === "reserved" ? "ok" : "open")}
                </li>
              ))}
            </ul>
          )}
        </RequestBlock>
        <RequestBlock labels={labels} id="connect" title={t("reqJobs")} enabled={on("connect")} newHref="/jobs/new" count={bundle.jobs.length}>
          {bundle.jobs.length === 0 ? <p className="text-sm text-ink/70">{t("reqNone")}</p> : (
            <ul className="divide-y divide-line">
              {bundle.jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-ink">{j.space_type} · {j.frequency} · {t(`job_${j.status}` as "job_published")}</span>
                  <Link href="/jobs" className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-bold text-forest">{t("responsesCount", { count: j.responses })}</Link>
                </li>
              ))}
            </ul>
          )}
        </RequestBlock>
        <RequestBlock labels={labels} id="oneoff" title={t("reqOneoff")} enabled={on("oneoff")} newHref="/jobs/new" count={bundle.jobs.filter((j) => j.frequency === "once").length}>
          <p className="text-sm text-ink/70">{t("tileDesc_oneoff")}</p>
        </RequestBlock>
        <RequestBlock labels={labels} id="contract" title={t("reqContract")} enabled={on("contract")} newHref="/jobs/new" count={0}>
          <p className="text-sm text-ink/70">{t("tileDesc_contract")}</p>
        </RequestBlock>
      </div>
    </section>
  );
}
