import Image from "next/image";
import { notFound } from "next/navigation";
import { siteImageUrl } from "@/lib/site-media";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { BusinessTypeIcon } from "@/components/business/BusinessTypeCard";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, monthlyFee, type BusinessType } from "@/lib/business";
import { getPricingContext } from "@/lib/services";
import { quoteFor } from "@/lib/business-pricing";
import { BusinessPrice } from "@/components/business/BusinessPrice";
import { formatEuro } from "@/lib/money";

/** Prices and the service catalogue come from the database on every request (no stale prices). */
export const dynamic = "force-dynamic";

/** Labelled demo screen per business type (brief v2 §2). */
function DemoScreen({ lang }: { lang: "nl" | "en" }) {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const chip = (text: string, tone: "open" | "done" | "urgent" | "ok") => (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone === "done" || tone === "ok" ? "bg-mint text-forest" : tone === "urgent" ? "bg-red-100 text-red-800" : "bg-sun/30 text-ink"}`}>{text}</span>
  );
  const row = (left: string, right: React.ReactNode) => (
    <li className="flex items-center justify-between gap-3 py-2 text-sm"><span className="font-semibold text-ink">{left}</span>{right}</li>
  );

  return (
    <ul className="divide-y divide-line">
      {row(t("Klus: wekelijks, maandagochtend vóór 9:00", "Job: weekly, Monday morning before 9:00"), chip(t("3 offertes", "3 quotations"), "open"))}
      {row(t("Yusuf D. · 8 jaar ervaring", "Yusuf D. · 8 years' experience"), chip(t("offerte", "quotation"), "ok"))}
      {row(t("Kofi A. · 5 jaar ervaring", "Kofi A. · 5 years' experience"), chip(t("offerte", "quotation"), "ok"))}
      {row(t("Hassan E. · 3 jaar ervaring", "Hassan E. · 3 years' experience"), chip(t("offerte", "quotation"), "ok"))}
    </ul>
  );
}

export default async function BusinessTypePage({ params }: { params: Promise<{ locale: string; type: string }> }) {
  const { locale, type } = await params;
  setRequestLocale(locale);
  if (!BUSINESS_TYPE_KEYS.includes(type as BusinessType)) notFound();
  const bt = type as BusinessType;
  const t = await getTranslations("business");
  const tp = await getTranslations(`businessPages.${bt}`);
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const cfg = BUSINESS_TYPES[bt];
  const { unitPrices, businessPricing } = await getPricingContext();
  const unitPrice = unitPrices[bt] ?? null; // only with an active monthly rule
  const exampleUnits = bt === "hotel" ? 20 : bt === "airbnb" ? 4 : 1;
  const example = unitPrice ? monthlyFee(bt, exampleUnits, { airbnb: 0, hotel: 0, restaurant: 0, office: 0, [bt]: unitPrice }) : null;
  const photo = await siteImageUrl(`business-${bt}`);

  return (
    <div>
      <section className="bg-section">
        <div className={`mx-auto max-w-6xl items-center gap-8 px-4 py-12 md:py-16 ${photo ? "grid md:grid-cols-[1.2fr_1fr]" : ""}`}>
        <div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-forest"><BusinessTypeIcon type={bt} className="h-8 w-8" /></span>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-forest">{cfg.label[lang]}</p>
          <h1 className="headline mt-2 max-w-2xl text-4xl text-ink sm:text-5xl">{tp("heroTitle")}</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/75">{tp("heroText")}</p>
          <div className="mt-6 rounded-card-lg bg-white p-5 shadow-sm">
            <p className="text-sm text-ink/70">{t("liveTotalLabel")}</p>
            {/* the price follows the model chosen in Admin → Settings → Business pricing */}
            {businessPricing.model === "per_location" && unitPrice && example ? (
              <>
                <p className="text-2xl font-extrabold text-forest">
                  {formatEuro(unitPrice, lang)} <span className="text-base font-semibold text-ink/70">{t("perUnitMonth", { unit: cfg.unit[lang] })} · {t("exclBtw")}</span>
                </p>
                <p className="mt-1 text-sm text-ink/70">{tp("example", { units: exampleUnits, fee: formatEuro(example.netCents, lang) })}</p>
              </>
            ) : businessPricing.model === "tiers" && businessPricing.tiers.length > 0 ? (
              <ul className="mt-1 space-y-1" data-price="tiers">
                {businessPricing.tiers.map((tier) => (
                  <li key={tier.name} className="text-ink">
                    <span className="text-lg font-extrabold text-forest">{t("tierPrice", { name: tier.name, price: formatEuro(tier.priceCents, lang) })}</span>
                    <span className="text-sm text-ink/70"> · {t("tierUpTo", { name: tier.name, limit: tier.maxLocations })}</span>
                  </li>
                ))}
                <li className="text-xs text-ink/70">{t("exclBtw")}</li>
              </ul>
            ) : (
              <BusinessPrice quote={quoteFor(businessPricing, bt, exampleUnits, unitPrices)} unit={cfg.unit[lang]} variant="hero" />
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`/business/signup?type=${bt}`} withArrow>{t("heroCta")}</ButtonLink>
            <ButtonLink href={`/search?jobType=${bt}`} variant="secondary">{t("browseCleaners")}</ButtonLink>
          </div>
          <p className="mt-4 text-sm font-semibold text-forest">{t("noCommission")}</p>
        </div>
        {photo ? (
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[2rem] shadow-xl shadow-forest/10">
            <Image src={photo} alt="" fill sizes="(min-width: 768px) 480px, 100vw" unoptimized={photo.startsWith("http")} className="object-cover" />
          </div>
        ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <ul className="grid gap-4 md:grid-cols-3">
          {([1, 2, 3] as const).map((i) => (
            <li key={i} className="rounded-card-lg border border-line bg-white p-5">
              <h2 className="text-lg font-extrabold text-ink">{tp(`benefit${i}Title`)}</h2>
              <p className="mt-1 text-sm text-ink/70">{tp(`benefit${i}Text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-section">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="headline text-2xl text-ink sm:text-3xl">{t("demoTitle")}</h2>
          <p className="mt-2 text-ink/70">{tp("demoCaption")}</p>
          <div className="mt-5 max-w-2xl rounded-card-lg border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">{tp("demoHeading")}</span>
              <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">{t("demoBadge")}</span>
            </div>
            <div className="mt-3"><DemoScreen lang={lang} /></div>
          </div>
          <div className="mt-6 rounded-card-lg bg-forest p-6 text-white">
            <h3 className="headline text-xl">{t("billingTitle")}</h3>
            <p className="mt-2 text-sm text-white/85">{t("billingText")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
