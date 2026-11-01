import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { JobsBoard } from "@/components/jobs/JobsBoard";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("jobs");
  const tCommon = await getTranslations("common");

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="headline text-3xl text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink/70">{t("intro")}</p>
        </div>
        <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">
          {tCommon("sampleBadge")}
        </span>
      </div>
      <div className="mt-4">
        <ButtonLink href="/jobs/new" withArrow>
          {t("postCta")}
        </ButtonLink>
      </div>
      <JobsBoard />
    </section>
  );
}
