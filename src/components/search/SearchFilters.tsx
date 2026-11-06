import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import type { CleanerFilters } from "@/lib/cleaners";
import { JOB_TYPE_LABELS, LANGUAGE_LABELS, SERVICE_LABELS, type JobType } from "@/lib/sample-data";

const selectCls =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function SearchFilters({ filters }: { filters: CleanerFilters }) {
  const t = useTranslations("search");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";
  const action = getPathname({ href: "/search", locale });
  // Mirrors searchCleaners: nearest first when a postcode or town is given, otherwise most verified jobs.
  const defaultSort = filters.sort ?? (filters.q ? "distance" : "jobs");

  return (
    <form action={action} method="get" className="rounded-card-lg border border-line bg-section p-4">
      <h2 className="sr-only">{t("filters")}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {tHome("searchLabel")}
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={tHome("searchPlaceholder")}
            autoComplete="postal-code"
            className={selectCls}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {t("service")}
          <select name="service" defaultValue={filters.service ?? ""} className={selectCls}>
            <option value="">{t("any")}</option>
            {Object.entries(SERVICE_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>
                {labels[locale]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {t("maxRate")}
          <select
            name="maxRate"
            defaultValue={filters.maxRateCents ? String(filters.maxRateCents / 100) : ""}
            className={selectCls}
          >
            <option value="">{t("any")}</option>
            {[16, 18, 20, 22, 25, 30].map((euro) => (
              <option key={euro} value={euro}>
                € {euro}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {t("day")}
          <select name="day" defaultValue={filters.day !== undefined ? String(filters.day) : ""} className={selectCls}>
            <option value="">{t("any")}</option>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {tCommon(`day${d}` as "day0")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {t("jobType")}
          <select name="jobType" defaultValue={filters.jobType ?? ""} className={selectCls}>
            <option value="">{t("any")}</option>
            {(Object.keys(JOB_TYPE_LABELS) as JobType[]).map((key) => (
              <option key={key} value={key}>
                {JOB_TYPE_LABELS[key][locale]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink/70">
          {t("language")}
          <select name="language" defaultValue={filters.language ?? ""} className={selectCls}>
            <option value="">{t("any")}</option>
            {Object.entries(LANGUAGE_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>
                {labels[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink/70">
          {t("sort")}
          <select name="sort" defaultValue={defaultSort} className="min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="distance">{t("sortDistance")}</option>
            <option value="price">{t("sortPrice")}</option>
            <option value="jobs">{t("sortJobs")}</option>
            {filters.sort === "rating" ? <option value="rating">{t("sortRating")}</option> : null}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-forest-dark"
        >
          {t("apply")}
        </button>
      </div>
    </form>
  );
}
