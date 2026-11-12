import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { loadBusinessPage } from "@/lib/business-page";
import { enabledFor, getCatalog, type ServiceKey } from "@/lib/services";
import type { BusinessBundle, BusinessJob } from "@/lib/business-data";
import { FREQUENCY_LABELS, SPACE_TYPE_LABELS, isRecurring, jobServiceKey, scheduleSummary, type Frequency, type SpaceType } from "@/lib/jobs";
import { QuoteList } from "@/components/jobs/QuoteList";
import { CancelAwardedButton, RemoveJobButton } from "@/components/jobs/JobActions";

export const dynamic = "force-dynamic";

const chip = (text: string, tone: "open" | "ok" | "muted" | "warn") => (
  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone === "ok" ? "bg-mint text-forest" : tone === "warn" ? "bg-red-100 text-red-800" : tone === "muted" ? "bg-section text-ink/60" : "bg-sun/30 text-ink"}`}>{text}</span>
);

type Labels = { count: (n: number) => string; reqNew: string; soon: string; offNote: (id: string) => string };
function RequestBlock({ id, title, enabled, newHref, count, labels, children }: { id: string; title: string; enabled: boolean; newHref: string; count: number; labels: Labels; children: React.ReactNode }) {
  return (
    <section className="rounded-card-lg border border-line bg-white p-5" data-request-block={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-lg font-extrabold text-ink">{title} <span className="text-sm font-semibold text-ink/60">· {labels.count(count)}</span></h2>
        {enabled ? <Link href={newHref} className="shrink-0 rounded-full bg-forest px-4 py-1.5 text-xs font-bold text-white">{labels.reqNew}</Link> : chip(labels.soon, "muted")}
      </div>
      <div className="mt-3">{enabled ? children : <p className="text-sm text-ink/70">{labels.offNote(id)}</p>}</div>
    </section>
  );
}


type JobT = (key: string, values?: Record<string, string | number>) => string;

/** Jobs of one service (one-off or regular): quotations while open, the awarded cleaner and upcoming visits once awarded. */
function JobList({ jobs, bundle, lang, t, fmt }: { jobs: BusinessJob[]; bundle: BusinessBundle; lang: "nl" | "en"; t: JobT; fmt: (iso: string) => string }) {
  if (jobs.length === 0) return <p className="text-sm text-ink/70">{t("reqNone")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((j) => {
        const freq = j.frequency as Frequency;
        const awarded = j.quotes.find((q) => q.id === j.awardedResponseId);
        const visits = bundle.workRecords.filter((w) => w.job_id === j.id && w.outcome === "scheduled" && w.scheduled_start && new Date(w.scheduled_start).getTime() > Date.now() - 36e5).sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "")).slice(0, 4);
        const state = j.status === "filled" ? (j.endedAt ? "ended" : "awarded") : j.status;
        const tone = state === "awarded" ? "ok" : state === "published" ? "open" : "muted";
        const summary = scheduleSummary(freq, j.schedule, lang);
        return (
          <li key={j.id} className="rounded-xl border border-line p-4" data-job={j.id} data-job-state={state}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-extrabold text-ink">{SPACE_TYPE_LABELS[j.space_type as SpaceType]?.[lang] ?? j.space_type} · {FREQUENCY_LABELS[freq]?.[lang] ?? j.frequency}</p>
                {summary ? <p className="text-xs font-semibold text-ink/70">{summary}</p> : null}
                <p className="mt-1 line-clamp-2 text-sm text-ink/70">{j.description}</p>
              </div>
              {chip(t(`jobState_${state}`), tone)}
            </div>
            {j.status === "published" ? (
              <div className="mt-3 rounded-xl bg-section p-3">
                <p className="mb-1 text-sm font-bold text-ink">{t("responsesCount", { count: j.quotes.length })}</p>
                <QuoteList quotes={j.quotes} visitHours={j.schedule.visitHours} canDecide />
                <div className="mt-2"><RemoveJobButton jobId={j.id} /></div>
              </div>
            ) : null}
            {j.status === "filled" ? (
              <div className="mt-3 flex flex-col gap-2 rounded-xl bg-mint/60 p-3 text-sm">
                <p className="font-semibold text-ink">{awarded ? t("awardedTo", { name: awarded.name }) : t("awardedGeneric")}{j.endedAt ? ` · ${t("endedBy", { who: t(j.endedBy === "cleaner" ? "byCleaner" : "byBusiness") })}` : ""}</p>
                {visits.length ? (
                  <ul className="text-xs text-ink/80">{visits.map((v) => <li key={v.id}>{fmt(v.scheduled_start as string)}</li>)}</ul>
                ) : !j.endedAt && isRecurring(freq) ? <p className="text-xs text-ink/70">{t("noUpcomingVisits")}</p> : null}
                {!j.endedAt ? <CancelAwardedButton jobId={j.id} /> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
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
  const jobsOf = (service: "oneoff" | "contract") => bundle.jobs.filter((j) => jobServiceKey(j.frequency as Frequency) === service);
  const oneoffJobs = jobsOf("oneoff");
  const contractJobs = jobsOf("contract");

  const labels = { count: (n: number) => t("reqCount", { count: n }), reqNew: t("reqNew"), soon: t("tileSoon"), offNote: (id: string) => (catalog.find((c) => c.service_key === id)?.enabled ? t("reqOff") : t("reqSoon")) };

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("requestsTitle")}</h1>
      <BusinessSubnav />
      <p className="mt-4 text-sm text-ink/70">{t("requestsIntro")}</p>
      <div className="mt-5 flex flex-col gap-4">
        <RequestBlock labels={labels} id="connect" title={t("reqConnect")} enabled={on("connect")} newHref="/search" count={bundle.connectedCleaners.length}>
          {bundle.connectedCleaners.length === 0 ? <p className="text-sm text-ink/70">{t("reqConnectNone")}</p> : (
            <ul className="divide-y divide-line">
              {bundle.connectedCleaners.map((c) => (
                <li key={c.cleanerId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-ink">{c.name}</span>
                  <Link href="/messages" className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-bold text-forest">{t("reqChat")}</Link>
                </li>
              ))}
            </ul>
          )}
        </RequestBlock>
        <RequestBlock labels={labels} id="oneoff" title={t("reqOneoff")} enabled={on("oneoff")} newHref="/jobs/new?kind=oneoff" count={oneoffJobs.length}>
          <JobList jobs={oneoffJobs} bundle={bundle} lang={lang} t={t as unknown as JobT} fmt={fmt} />
        </RequestBlock>
        <RequestBlock labels={labels} id="contract" title={t("reqContract")} enabled={on("contract")} newHref="/jobs/new?kind=contract" count={contractJobs.length}>
          <JobList jobs={contractJobs} bundle={bundle} lang={lang} t={t as unknown as JobT} fmt={fmt} />
        </RequestBlock>
      </div>
    </section>
  );
}
