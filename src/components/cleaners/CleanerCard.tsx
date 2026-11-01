import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatHourlyRate } from "@/lib/money";
import { SERVICE_LABELS, type SampleCleaner } from "@/lib/sample-data";
import { FavouriteButton } from "./FavouriteButton";

type Props = {
  cleaner: SampleCleaner;
  distanceKm?: number | null;
};

export function CleanerCard({ cleaner, distanceKm }: Props) {
  const locale = useLocale() as "nl" | "en";
  const t = useTranslations("home");
  const tSearch = useTranslations("search");

  return (
    <article className="relative flex h-full flex-col gap-3 rounded-card-lg border border-line bg-white p-5 shadow-sm">
      <FavouriteButton cleanerId={cleaner.id} className="absolute right-4 top-4" />

      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="9" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </span>
        <div className="pr-10">
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
            {typeof distanceKm === "number" ? (
              <span className="ml-2 font-medium text-ink/60">
                · {tSearch("distanceAway", { km: distanceKm })}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2">
        {cleaner.services.map((service) => (
          <li key={service} className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">
            {SERVICE_LABELS[service]?.[locale] ?? service}
          </li>
        ))}
        <li className="rounded-full bg-section px-3 py-1 text-xs font-semibold text-ink/60">
          {tSearch("minHoursShort", { hours: cleaner.minHours })}
        </li>
      </ul>

      <div className="mt-auto pt-1">
        <Link
          href={`/cleaners/${cleaner.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-forest px-6 py-3 text-sm font-bold text-forest transition-colors hover:bg-mint"
        >
          {t("viewProfile")}
        </Link>
      </div>
    </article>
  );
}
