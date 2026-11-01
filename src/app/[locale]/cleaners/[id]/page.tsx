import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getCleaner, isVogValid } from "@/lib/cleaners";
import { fetchLiveCleaner } from "@/lib/cleaners-live";
import { formatHourlyRate } from "@/lib/money";
import { LANGUAGE_LABELS, SERVICE_LABELS } from "@/lib/sample-data";
import { AvailabilityGrid } from "@/components/cleaners/AvailabilityGrid";
import { FavouriteButton } from "@/components/cleaners/FavouriteButton";
import { MeetingRequestButton } from "@/components/cleaners/MeetingRequestButton";
import { ReportButton } from "@/components/cleaners/ReportButton";

export default async function CleanerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  const tHome = await getTranslations("home");
  const tCommon = await getTranslations("common");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";

  const cleaner = (await fetchLiveCleaner(id)) ?? getCleaner(id);
  if (!cleaner) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/* header card */}
      <header className="relative rounded-card-lg border border-line bg-white p-6 shadow-sm">
        <FavouriteButton cleanerId={cleaner.id} className="absolute right-5 top-5" />
        <div className="flex items-center gap-5">
          <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
            <svg viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="9" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </span>
          <div>
            <h1 className="headline flex flex-wrap items-center gap-2 text-3xl text-ink">
              {cleaner.name}
              {isVogValid(cleaner.vog, new Date()) ? (
                <span className="rounded-full bg-forest px-2.5 py-1 text-xs font-bold text-white">VOG ✓</span>
              ) : null}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/70">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-sun-dark" fill="currentColor" aria-hidden="true">
                <path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8 2.4-5Z" />
              </svg>
              <strong className="text-ink">{cleaner.rating.toFixed(1)}</strong>
              <span>({tHome("reviewsCount", { count: cleaner.reviewCount })})</span>
              <span>· {t("verifiedJobs", { count: cleaner.verifiedJobs })}</span>
            </p>
            <p className="mt-1 text-xl font-extrabold text-forest">
              {formatHourlyRate(cleaner.rateCents, lang)}
              <span className="text-sm font-medium text-ink/70">{tHome("perHour")}</span>
            </p>
            <p className="text-sm text-ink/70">
              {t("minHours", { hours: cleaner.minHours })} · {t("travels", { km: cleaner.radiusKm, postcode: cleaner.postcode })}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <MeetingRequestButton cleaner={cleaner} />
        </div>
      </header>

      {/* about */}
      <section className="mt-6">
        <h2 className="headline text-xl text-ink">{t("aboutTitle")}</h2>
        <p className="mt-2 text-ink/80">{cleaner.about[lang]}</p>
      </section>

      {/* services + languages */}
      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="headline text-xl text-ink">{t("servicesTitle")}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {cleaner.services.map((s) => (
              <li key={s} className="rounded-full bg-mint px-3 py-1.5 text-sm font-semibold text-forest">
                {SERVICE_LABELS[s]?.[lang] ?? s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="headline text-xl text-ink">{t("languagesTitle")}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {cleaner.languages.map((l) => (
              <li key={l} className="rounded-full bg-section px-3 py-1.5 text-sm font-semibold text-ink/80">
                {LANGUAGE_LABELS[l]?.[lang] ?? l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* availability */}
      <section className="mt-6">
        <h2 className="headline text-xl text-ink">{t("availabilityTitle")}</h2>
        <div className="mt-3 rounded-card-lg border border-line bg-white p-4">
          <AvailabilityGrid availability={cleaner.availability} />
        </div>
      </section>

      {/* reviews */}
      <section className="mt-6">
        <h2 className="headline text-xl text-ink">{t("reviewsTitle")}</h2>
        <p className="mt-1 text-xs text-ink/70">{t("reviewsNote")}</p>
        {cleaner.reviews.length === 0 ? (
          <p className="mt-3 text-ink/70">{t("noReviews")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cleaner.reviews.map((review) => (
              <li key={review.id} className="rounded-card-lg border border-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-ink">{review.author}</strong>
                  <span className="flex items-center gap-1 text-sm font-bold text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-sun-dark" fill="currentColor" aria-hidden="true">
                      <path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8 2.4-5Z" />
                    </svg>
                    {review.rating.toFixed(1)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/80">{review.text[lang]}</p>
                <p className="mt-1 text-xs text-ink/70">{review.date}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* report */}
      <footer className="mt-8 border-t border-line pt-6">
        <ReportButton subjectId={cleaner.id} />
        <p className="mt-4 rounded-full bg-sun/30 px-3 py-1 text-center text-xs font-semibold text-ink/70">
          {tCommon("sampleBadge")}
        </p>
      </footer>
    </article>
  );
}
