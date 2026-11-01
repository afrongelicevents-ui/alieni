import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobPostForm } from "@/components/jobs/JobPostForm";

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("jobs");

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("postTitle")}</h1>
      <p className="mt-2 text-ink/70">{t("postIntro")}</p>
      <div className="mt-6">
        <JobPostForm />
      </div>
    </section>
  );
}
