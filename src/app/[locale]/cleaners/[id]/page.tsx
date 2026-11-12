import { getPublicHouseholdFeeCents } from "@/lib/site-settings";
import { ReviewForm } from "@/components/cleaners/ReviewForm";
import { canReview } from "@/lib/reviews-data";
import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getCleaner } from "@/lib/cleaners";
import { fetchLiveCleaner, fetchOwnCleaner } from "@/lib/cleaners-live";
import { formatHourlyRate } from "@/lib/money";
import { LANGUAGE_LABELS, SERVICE_LABELS } from "@/lib/sample-data";
import { AvailabilityGrid } from "@/components/cleaners/AvailabilityGrid";
import { FavouriteButton } from "@/components/cleaners/FavouriteButton";
import { MeetingRequestButton } from "@/components/cleaners/MeetingRequestButton";
import { ReportButton } from "@/components/cleaners/ReportButton";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

  const [live, user] = await Promise.all([fetchLiveCleaner(id), getSessionUser()]);
  // The owner (and an admin) can always open the ad, also as a draft or while hidden.
  const own = !live && user ? await fetchOwnCleaner(id, user) : null;
  const cleaner = live ?? own ?? getCleaner(id);
  if (!cleaner) notFound();
  const notPublic = own ? own.status : null;
  // cleaners and admins cannot request a meeting or keep favourites: guests, households and businesses can
  const canContact = !user || user.role === "household" || user.role === "business";
  const canReviewCleaner = live && user ? await canReview(user.id, cleaner.id) : false;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {notPublic ? (
        <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm font-semibold text-ink/80" data-not-public={notPublic}>{t(`notPublic_${notPublic}` as "notPublic_draft")}</p>
      ) : null}
      {/* header card */}
      <header className="relative rounded-card-lg border border-line bg-white p-6 shadow-sm">
        {canContact ? <FavouriteButton cleanerId={cleaner.id} className="absolute right-5 top-5" /> : null}
        <div className="flex items-center gap-5">
          <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
            {cleaner.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage URL, pre-sized 600px square
              <img src={cleaner.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="9" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            )}
          </span>
          <div className="min-w-0 pr-10">
            <h1 className="headline flex flex-wrap items-center gap-2 break-words text-3xl text-ink">
              {cleaner.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink/70">
              {cleaner.reviewCount > 0 ? (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-sun-dark" fill="currentColor" aria-hidden="true">
                    <path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8 2.4-5Z" />
                  </svg>
                  <strong className="text-ink">{cleaner.rating.toFixed(1)}</strong>
                  <span>({tHome("reviewsCount", { count: cleaner.reviewCount })})</span>
                  <span>·</span>
                </>
              ) : null}
              <span>{t("verifiedJobs", { count: cleaner.verifiedJobs })}</span>
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

        {canContact ? (
          <div className="mt-5">
            <MeetingRequestButton cleaner={cleaner} signedIn={Boolean(user)} feeCents={await getPublicHouseholdFeeCents()} />
          </div>
        ) : null}
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
                  <strong className="text-sm text-ink">{review.author || t("confirmedClient")}</strong>
                  <span className="flex items-center gap-1 text-sm font-bold text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-sun-dark" fill="currentColor" aria-hidden="true">
                      <path d="M12 3.5l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8 2.4-5Z" />
                    </svg>
                    {review.rating.toFixed(1)}
                  </span>
                </div>
                {review.text[lang] ? <p className="mt-1 text-sm text-ink/80">{review.text[lang]}</p> : null}
                <p className="mt-1 text-xs text-ink/70">{review.date}</p>
                {user && /^[0-9a-f-]{36}$/i.test(review.id) ? <div className="mt-1"><ReportButton subjectId={review.id} subjectType="review" /></div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canReviewCleaner ? <ReviewForm cleanerProfileId={cleaner.id} /> : null}

      {/* report */}
      <footer className="mt-8 border-t border-line pt-6">
        <ReportButton subjectId={cleaner.id} />
        {!live ? (
          <p className="mt-4 rounded-full bg-sun/30 px-3 py-1 text-center text-xs font-semibold text-ink/70">
            {tCommon("sampleBadge")}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
