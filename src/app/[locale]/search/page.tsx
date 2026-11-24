import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseFilters, searchCleaners } from "@/lib/cleaners";
import { SAMPLE_CLEANERS } from "@/lib/sample-data";
import { fetchLiveCleaners } from "@/lib/cleaners-live";
import { getSessionUser } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { fetchDistances } from "@/lib/cleaners-live";
import { SearchFilters } from "@/components/search/SearchFilters";
import { CleanerCard } from "@/components/cleaners/CleanerCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");
  const tCommon = await getTranslations("common");

  const filters = parseFilters(await searchParams);
  const [origin, live, user] = await Promise.all([
    filters.q ? geocode(filters.q) : Promise.resolve(null),
    fetchLiveCleaners(),
    getSessionUser(),
  ]);
  // Real ads first; then the eight sample profiles (marked "Voorbeeldprofiel / Sample profile" on every card),
  // filtered the same way, so the page shows what Alieni looks like while there are few real ads.
  const distances = origin && (live?.length ?? 0) > 0 ? await fetchDistances(origin) : undefined;
  const viewer = user?.role === "household" ? "household" : user?.role === "business" ? "business" : "any";
  const real = searchCleaners(filters, { origin, dataset: live ?? [], distances, viewer });
  const samples = searchCleaners(filters, { origin, dataset: SAMPLE_CLEANERS, viewer });
  const results = [...real, ...samples];
  const showSamples = samples.length > 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        {showSamples ? (
          <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">
            {tCommon("sampleProfilesNote")}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <SearchFilters filters={filters} />
      </div>

      <p className="mt-6 text-sm font-semibold text-ink/70" aria-live="polite">
        {t("results", { count: results.length })}
      </p>

      {results.length === 0 ? (
        <p className="mt-4 max-w-md text-ink/70">{t("noResults")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((cleaner) => (
            <li key={cleaner.id}>
              <CleanerCard cleaner={cleaner} distanceKm={cleaner.distanceKm} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
