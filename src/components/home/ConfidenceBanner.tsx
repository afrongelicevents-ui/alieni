import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";

export function ConfidenceBanner() {
  const t = useTranslations("home");

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col items-start gap-4 rounded-card-lg bg-forest p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2" strokeWidth="2" />
              <path d="M3.5 9.5h17M8 3v4m8-4v4" strokeWidth="2" strokeLinecap="round" />
              <path d="M8 14h2m3 0h2m-7 3.5h2" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="headline text-xl">{t("bannerTitle")}</h2>
            <p className="text-sm text-white/80">{t("bannerText")}</p>
          </div>
        </div>
        <ButtonLink href="/signup" withArrow className="shrink-0">
          {t("bannerCta")}
        </ButtonLink>
      </div>
    </section>
  );
}
