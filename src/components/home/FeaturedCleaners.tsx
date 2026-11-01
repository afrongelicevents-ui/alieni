import { useTranslations, useLocale } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";
import { formatHourlyRate } from "@/lib/money";
import { SAMPLE_FEATURED_CLEANERS, SERVICE_LABELS } from "@/lib/sample-data";

export function FeaturedCleaners() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";

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
            <article className="relative flex h-full flex-col gap-3 rounded-card-lg border border-line bg-white p-5 shadow-sm">
              <button
                type="button"
                aria-label={tCommon("favourite")}
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-mint"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.4 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="flex items-center gap-4">
                {/* Photo placeholder until real profile photos exist */}
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
                  <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="9" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-ink">{cleaner.name}</h3>
                  <p className="flex items-center gap-1.5 text-sm text-ink/70">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-sun-dark" fill="currentColor" aria-hidden="true">
                      <path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8 2.4-5Z" />
                    </svg>
                    <strong className="text-ink">{cleaner.rating.toFixed(1)}</strong>
                    <span>({t("reviewsCount", { count: cleaner.reviewCount })})</span>
                  </p>
                  <p className="text-sm font-bold text-forest">
                    {formatHourlyRate(cleaner.rateCents, locale)}
                    <span className="font-medium text-ink/60">{t("perHour")}</span>
                    <span className="ml-2 font-medium text-ink/60">· {cleaner.city}</span>
                  </p>
                </div>
              </div>

              <ul className="flex flex-wrap gap-2">
                {cleaner.services.map((service) => (
                  <li key={service} className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">
                    {SERVICE_LABELS[service]?.[locale] ?? service}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-1">
                <ButtonLink href="/search" variant="secondary" className="w-full">
                  {t("viewProfile")}
                </ButtonLink>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
