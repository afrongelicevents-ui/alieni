import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobPostForm } from "@/components/jobs/JobPostForm";
import { ButtonLink } from "@/components/ui/Button";
import { requireRole } from "@/lib/guard";
import { getBusinessForUser } from "@/lib/business-data";

export const dynamic = "force-dynamic";

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("jobs");
  const user = await requireRole(locale, ["business"], "/jobs/new");
  const bundle = await getBusinessForUser(user.id);

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("postTitle")}</h1>
      <p className="mt-2 text-ink/70">{t("postIntro")}</p>
      <div className="mt-6">
        {!bundle ? (
          <div className="flex flex-col items-center gap-4 rounded-card-lg border border-line bg-white px-6 py-12 text-center">
            <p className="max-w-sm text-ink/70">{t("needBusiness")}</p>
            <ButtonLink href="/business/signup" withArrow>{t("createBusiness")}</ButtonLink>
          </div>
        ) : (
          <JobPostForm units={bundle.units.map((u) => ({ id: u.id, name: u.name || u.address_line, postcode: u.postcode, city: u.city }))} />
        )}
      </div>
    </section>
  );
}
