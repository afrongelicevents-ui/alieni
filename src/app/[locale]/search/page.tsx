import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseFilters, searchCleaners } from "@/lib/cleaners";
import { fetchLiveCleaners } from "@/lib/cleaners-live";
import { geocode } from "@/lib/geocode";
import { SearchFilters } from "@/components/search/SearchFilters";
import { CleanerCard } from "@/components/cleaners/CleanerCard";

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
  const [origin, live] = await Promise.all([
    filters.q ? geocode(filters.q) : Promise.resolve(null),
    fetchLiveCleaners(),
  ]);
  const results = searchCleaners(filters, { origin, dataset: live ?? undefined });

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">
          {tCommon("sampleBadge")}
        </span>
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
