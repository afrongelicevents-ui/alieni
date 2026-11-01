import { useTranslations, useLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";

export function PostcodeSearch() {
  const t = useTranslations("home");
  const locale = useLocale();
  const action = getPathname({ href: "/search", locale });

  return (
    <form
      action={action}
      method="get"
      role="search"
      className="flex items-center gap-1 rounded-full border border-line bg-white p-1.5 shadow-lg shadow-forest/5"
    >
      <svg viewBox="0 0 24 24" className="ml-3 h-5 w-5 shrink-0 text-forest" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          d="M12 21s-6.5-5.3-6.5-10.2A6.5 6.5 0 0 1 12 4.5a6.5 6.5 0 0 1 6.5 6.3C18.5 15.7 12 21 12 21Z"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10.8" r="2.3" strokeWidth="2" />
      </svg>
      <input
        type="text"
        name="q"
        inputMode="text"
        autoComplete="postal-code"
        aria-label={t("searchLabel")}
        placeholder={t("searchPlaceholder")}
        className="min-h-11 w-full min-w-0 bg-transparent px-2 text-base text-ink placeholder:text-ink/50 focus:outline-none"
      />
      <button
        type="submit"
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-forest px-6 font-bold text-white transition-colors hover:bg-forest-dark"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9.5 3-4.9-4.9" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        {t("searchButton")}
      </button>
    </form>
  );
}
