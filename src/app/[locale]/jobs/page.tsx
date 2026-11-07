import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { JobsBoard, type BoardJob, type Viewer } from "@/components/jobs/JobsBoard";
import { SAMPLE_JOBS } from "@/lib/jobs";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessNames } from "@/lib/business-public";
import { fetchPublishedJobs, toBoardJobs } from "@/lib/jobs-data";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("jobs");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const user = await getSessionUser();
  if (user?.role === "cleaner") redirect(`/${locale}/work?tab=jobs`);
  if (user?.role === "household") redirect(`/${locale}/home`);
  const supabase = await createClient();

  let myCleanerProfileId: string | null = null;
  let isBusiness = false;
  let myBusinessId: string | null = null;
  let jobs: BoardJob[] = [];

  if (supabase) {
    if (user) {
      const [{ data: cp }, { data: bp }] = await Promise.all([
        supabase.from("cleaner_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("business_profiles").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      myCleanerProfileId = cp?.id ?? null;
      isBusiness = Boolean(bp);
      myBusinessId = bp?.id ?? null;
    }
    const rows = await fetchPublishedJobs(supabase);
    // company names come from the restricted public view; nothing else about a company is readable here
    const companyOf = await businessNames(supabase, rows.map((r) => r.business_id));
    const responderIds = [...new Set(rows.flatMap((r) => (r.job_responses ?? []).map((x) => x.cleaner_profile_id)))];
    const nameOf = new Map<string, string>();
    if (responderIds.length) {
      const { data: cps } = await supabase.from("cleaner_profiles").select("id, profiles!cleaner_profiles_user_id_fkey ( display_name )").in("id", responderIds);
      for (const c of (cps ?? []) as unknown as { id: string; profiles: { display_name: string } | null }[]) nameOf.set(c.id, c.profiles?.display_name ?? "—");
    }
    jobs = toBoardJobs(rows, { companyOf, nameOf, myCleanerProfileId, myBusinessId });
  }

  // No real jobs yet: show labelled examples so the board is not empty.
  if (jobs.length === 0) {
    jobs = SAMPLE_JOBS.map((j) => ({
      id: j.id, companyName: j.companyName, spaceType: j.spaceType, sizeM2: j.sizeM2, postcode: j.postcode, city: j.city,
      frequency: j.frequency, scheduleNote: j.scheduleNote?.[lang] ?? null, description: j.description[lang], budgetCents: j.budgetCents,
      mine: false, sample: true, schedule: { startDate: null, endDate: null, weekdays: [], visitStart: null, visitHours: null }, myResponse: null, responses: [],
    }));
  }

  const viewer: Viewer = { signedIn: Boolean(user), isCleaner: Boolean(myCleanerProfileId), isBusiness };

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="headline text-3xl text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink/70">{t("intro")}</p>
        </div>
      </div>
      {user?.role === "admin" ? null : (
        <div className="mt-4">
          <ButtonLink href={isBusiness ? "/jobs/new" : user ? "/business/signup" : "/jobs/new"} withArrow>
            {t("postCta")}
          </ButtonLink>
        </div>
      )}
      <JobsBoard jobs={jobs} viewer={viewer} />
    </section>
  );
}
