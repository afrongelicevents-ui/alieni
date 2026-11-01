import { useTranslations } from "next-intl";
import { SAMPLE_FEATURED_CLEANERS } from "@/lib/sample-data";
import { CleanerCard } from "@/components/cleaners/CleanerCard";

export function FeaturedCleaners() {
  const t = useTranslations("home");

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-center gap-4">
        <span aria-hidden="true" className="h-0.5 w-10 rounded bg-forest/30" />
        <h2 className="headline text-center text-2xl text-ink sm:text-3xl">{t("featuredTitle")}</h2>
        <span aria-hidden="true" className="h-0.5 w-10 rounded bg-forest/30" />
      </div>

      {/* Sample-data notice (brief §12: sample data must be clearly labelled) */}
      <p className="mt-2 text-center text-xs font-medium text-ink/50">{t("sampleDataNotice")}</p>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {SAMPLE_FEATURED_CLEANERS.map((cleaner) => (
          <li key={cleaner.id}>
            <CleanerCard cleaner={cleaner} />
          </li>
        ))}
      </ul>
    </section>
  );
}
