import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/money";
import type { BusinessQuote } from "@/lib/business-pricing";

/**
 * One way to show a business price, whatever model the admin chose (Admin → Settings → Business pricing).
 * `unit` is the business type's unit word (listing / room / location). Amounts are excl. BTW.
 * variant: "card" (overview cards), "hero" (type page), "total" (sign-up live total), "dark" (dashboard).
 */
export function BusinessPrice({ quote, unit, variant = "card", from = false }: { quote: BusinessQuote; unit: string; variant?: "card" | "hero" | "total" | "dark"; from?: boolean }) {
  const t = useTranslations("business");
  const lang = useLocale() === "en" ? "en" : "nl";
  const eur = (c: number) => formatEuro(c, lang);
  const big = variant === "card" ? "text-xl" : "text-2xl lg:text-3xl";
  const amount = `${big} font-extrabold ${variant === "dark" ? "text-white" : "text-forest"}`;
  const small = `text-sm ${variant === "dark" ? "text-white/85" : "text-ink/70"}`;

  switch (quote.kind) {
    case "per_location":
      return (
        <div data-price="per_location">
          {variant === "total" ? (
            <p className={amount}>{t("unitPriceLabel", { units: quote.units, price: eur(quote.unitCents), fee: eur(quote.monthlyCents) })}</p>
          ) : (
            <p>
              <span className={amount}>{eur(quote.unitCents)}</span>
              <span className={`${small} font-semibold`}> {t("perUnitMonth", { unit })}</span>
            </p>
          )}
          <p className={`text-xs ${variant === "dark" ? "text-white/75" : "text-ink/70"}`}>{t("exclBtw")}</p>
        </div>
      );
    case "per_job_post":
      return (
        <div data-price="per_job_post">
          <p className={amount}>{t("perJobPost", { price: eur(quote.jobPostCents) })}</p>
          <p className={small}>{t("perJobPostNote")} {t("exclBtw")}</p>
        </div>
      );
    case "tier":
      return (
        <div data-price="tier">
          <p className={amount}>
            {from ? t("tierFrom", { price: eur(quote.monthlyCents) }) : t("tierPrice", { name: quote.tier.name, price: eur(quote.monthlyCents) })}
          </p>
          <p className={small}>{t("tierUpTo", { name: quote.tier.name, limit: quote.tier.maxLocations })} · {t("exclBtw")}</p>
        </div>
      );
    case "tier_over":
      return (
        <div data-price="tier_over">
          <p className={`${variant === "card" ? "text-base" : "text-lg"} font-extrabold ${variant === "dark" ? "text-white" : "text-forest"}`}>{t("tierOver", { limit: quote.maxLocations })}</p>
        </div>
      );
    case "free":
      return (
        <div data-price="free">
          <p className={amount}>{t("freeForBusiness")}</p>
          <p className={small}>{t("freeForBusinessNote")}</p>
        </div>
      );
    default:
      return (
        <div data-price="tba">
          {variant === "card" ? (
            <span className="inline-block rounded-full bg-sun/30 px-3 py-1 text-xs font-bold text-ink/80">{t("priceTba")}</span>
          ) : (
            <>
              <p className={amount}>{t("priceTba")}</p>
              <p className={small}>{t("priceTbaNote")}</p>
            </>
          )}
        </div>
      );
  }
}
