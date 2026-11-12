import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { getWorkForCleaner } from "@/lib/business-data";
import { MyWorkList } from "@/components/cleaners/MyWorkList";
import { businessNames } from "@/lib/business-public";
import { fetchPublishedJobs, getQuotesForCleaner, toBoardJobs, type MyQuote } from "@/lib/jobs-data";
import { MyQuotes } from "@/components/cleaners/MyQuotes";
import { JobsBoard, type BoardJob } from "@/components/jobs/JobsBoard";
import { ButtonLink } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/** Which posted-job space types fit a cleaner's chosen environments. */
function spaceTypesFor(jobTypes: string[]): string[] {
  const out = new Set<string>();
  if (jobTypes.includes("office")) { out.add("office"); out.add("shop"); out.add("other"); }
  if (jobTypes.includes("airbnb")) out.add("airbnb");
  if (jobTypes.includes("hotel") || jobTypes.includes("restaurant")) { out.add("hospitality"); out.add("other"); }
  return [...out];
}

/** Cleaner "Work": business jobs that match the profile, and the cleaner's own work and quotations. */
export default async function WorkPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab = "jobs" } = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ["cleaner"], `/work${tab !== "jobs" ? `?tab=${encodeURIComponent(tab)}` : ""}`, { adminAllowed: false });
  const t = await getTranslations("work");
  const supabase = (await createClient())!;

  const { data: cp } = await supabase.from("cleaner_profiles").select("id, status, job_types, work_scope, work_types, rate_cents").eq("user_id", user.id).maybeSingle();
  const profile = cp as { id: string; status: string; job_types: string[]; work_scope: string; work_types: string[] | null; rate_cents: number } | null;

  if (!profile) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        <div className="mt-6 flex flex-col items-center gap-4 rounded-card-lg border border-line bg-white px-6 py-12 text-center">
          <p className="max-w-sm text-ink/70">{t("needProfile")}</p>
          <ButtonLink href="/profile" withArrow>{t("createProfile")}</ButtonLink>
        </div>
      </section>
    );
  }

  const commercial = profile.work_scope !== "household";
  // Sections follow the cleaner's chosen work types (profiles saved before Phase 1 fall back to scope).
  const wt = profile.work_types ?? [];
  const legacy = wt.length === 0;
  const tabs = [
    { key: "jobs", label: t("tabJobs"), show: commercial && (legacy || wt.includes("commercial_contract") || spaceTypesFor(profile.job_types).length > 0) },
    { key: "mine", label: t("tabMine"), show: true },
  ].filter((x) => x.show);
  const current = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;

  let jobs: BoardJob[] = [];
  let work: Awaited<ReturnType<typeof getWorkForCleaner>> = [];
  let quotes: MyQuote[] = [];

  if (current === "jobs") {
    const spaceTypes = spaceTypesFor(profile.job_types);
    const jobRows = spaceTypes.length ? await fetchPublishedJobs(supabase, { spaceTypes }) : [];
    const companyOf = await businessNames(supabase, jobRows.map((r) => r.business_id));
    jobs = toBoardJobs(jobRows, { companyOf, myCleanerProfileId: profile.id, myBusinessId: null });
  }
  if (current === "mine") {
    work = await getWorkForCleaner(profile.id);
    quotes = await getQuotesForCleaner(supabase, profile.id, (ids) => businessNames(supabase, ids));
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink/70">{commercial ? t("introCommercial") : t("introHousehold")}</p>
      {!commercial ? (
        <p className="mt-3 rounded-xl bg-mint p-3 text-sm text-forest">{t("householdOnlyNote")} <Link href="/profile?step=2&edit=1" className="font-bold underline">{t("changeScope")}</Link></p>
      ) : null}

      <nav className="mt-5 flex gap-2 overflow-x-auto" aria-label={t("title")}>
        {tabs.map((x) => (
          <Link key={x.key} href={`/work?tab=${x.key}`} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${current === x.key ? "bg-forest text-white" : "border border-line bg-white text-forest hover:bg-mint"}`}>{x.label}</Link>
        ))}
      </nav>

      <div className="mt-4">
        {current === "jobs" ? <JobsBoard jobs={jobs} viewer={{ signedIn: true, isCleaner: true, isBusiness: false }} /> : null}
        {current === "mine" ? (<><p className="mb-3 text-sm text-ink/70">{t("mineIntro")}</p><MyWorkList records={work} /><h2 className="mb-2 mt-6 text-lg font-extrabold text-ink">{t("myQuotesTitle")}</h2><MyQuotes quotes={quotes} /></>) : null}
      </div>
      {profile.status !== "published" ? <p className="mt-6 rounded-xl bg-sun/25 p-3 text-sm text-ink/80">{t("offlineNote")} <Link href="/profile" className="font-bold underline">{t("goProfile")}</Link></p> : null}
    </section>
  );
}
