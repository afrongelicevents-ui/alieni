import { useTranslations } from "next-intl";
import { SAMPLE_FEATURED_CLEANERS, type SampleCleaner } from "@/lib/sample-data";
import { CleanerCard } from "@/components/cleaners/CleanerCard";

/** Up to three real published cleaners; the labelled samples only while there are no real ads. */
export function FeaturedCleaners({ cleaners = [] }: { cleaners?: SampleCleaner[] }) {
  const t = useTranslations("home");
  const isSample = cleaners.length === 0;
  const shown = isSample ? SAMPLE_FEATURED_CLEANERS : cleaners.slice(0, 3);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-center gap-4">
        <span aria-hidden="true" className="h-0.5 w-10 rounded bg-forest/30" />
        <h2 className="headline text-center text-2xl text-ink sm:text-3xl">{t("featuredTitle")}</h2>
        <span aria-hidden="true" className="h-0.5 w-10 rounded bg-forest/30" />
      </div>

      {/* Sample-data notice (brief §12: sample data must be clearly labelled) */}
      {isSample ? <p className="mt-2 text-center text-xs font-medium text-ink/70">{t("sampleDataNotice")}</p> : null}

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {shown.map((cleaner) => (
          <li key={cleaner.id}>
            <CleanerCard cleaner={cleaner} />
          </li>
        ))}
      </ul>
    </section>
  );
}
