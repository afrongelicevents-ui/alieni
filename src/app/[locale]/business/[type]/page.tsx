import Image from "next/image";
import { notFound } from "next/navigation";
import { hasPublicImage } from "@/lib/public-image";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { BusinessTypeIcon } from "@/components/business/BusinessTypeCard";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, monthlyFee, type BusinessType } from "@/lib/business";
import { formatEuro } from "@/lib/money";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => BUSINESS_TYPE_KEYS.map((type) => ({ locale, type })));
}

/** Labelled demo screen per business type (brief v2 §2). */
function DemoScreen({ type, lang }: { type: BusinessType; lang: "nl" | "en" }) {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const chip = (text: string, tone: "open" | "done" | "urgent" | "ok") => (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone === "done" || tone === "ok" ? "bg-mint text-forest" : tone === "urgent" ? "bg-red-100 text-red-800" : "bg-sun/30 text-ink"}`}>{text}</span>
  );
  const row = (left: string, right: React.ReactNode) => (
    <li className="flex items-center justify-between gap-3 py-2 text-sm"><span className="font-semibold text-ink">{left}</span>{right}</li>
  );

  if (type === "airbnb" || type === "hotel") {
    return (
      <ul className="divide-y divide-line">
        {row(t("vr 21 nov · checkout 11:00 → 15:00", "Fri 21 Nov · checkout 11:00 → 15:00"), chip(t("gereserveerd · Fernanda S.", "reserved · Fernanda S."), "done"))}
        {row(t("ma 24 nov · checkout 11:00 → di 15:00", "Mon 24 Nov · checkout 11:00 → Tue 15:00"), chip(t("open", "open"), "open"))}
        {row(t("do 27 nov · checkout 11:00 → 15:00", "Thu 27 Nov · checkout 11:00 → 15:00"), chip(t("binnen 48u — nog niemand", "within 48h — nobody yet"), "urgent"))}
        {type === "hotel" ? row(t("za 29 nov · 8 kamerwissels", "Sat 29 Nov · 8 room turnovers"), chip(t("handmatig", "manual"), "open")) : null}
      </ul>
    );
  }
  if (type === "school") {
    return (
      <ul className="divide-y divide-line">
        {row("Maria V. · Utrecht · € 20/uur", chip("VOG ✓", "ok"))}
        {row("Lotte B. · Groningen · € 16/uur", chip("VOG ✓", "ok"))}
        <li className="py-2 text-xs text-ink/70">{t("Alleen schoonmakers met een goedgekeurde, recente VOG verschijnen in jouw zoekresultaten.", "Only cleaners with an approved, recent VOG appear in your search results.")}</li>
      </ul>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {row(t("Klus: wekelijks, maandagochtend vóór 9:00", "Job: weekly, Monday morning before 9:00"), chip(t("3 reacties", "3 responses"), "open"))}
      {row("Yusuf D. · € 26/uur", chip(t("reactie", "response"), "ok"))}
      {row("Kofi A. · € 28/uur", chip(t("reactie", "response"), "ok"))}
      {row("Hassan E. · € 30/uur", chip(t("reactie", "response"), "ok"))}
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
  const example = monthlyFee(bt, bt === "hotel" ? 20 : bt === "airbnb" ? 4 : 1);
  const exampleUnits = bt === "hotel" ? 20 : bt === "airbnb" ? 4 : 1;
  const hasPhoto = hasPublicImage(`img/business-${bt}.webp`);

  return (
    <div>
      <section className="bg-section">
        <div className={`mx-auto max-w-6xl items-center gap-8 px-4 py-12 md:py-16 ${hasPhoto ? "grid md:grid-cols-[1.2fr_1fr]" : ""}`}>
        <div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-forest"><BusinessTypeIcon type={bt} className="h-8 w-8" /></span>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-forest">{cfg.label[lang]}</p>
          <h1 className="headline mt-2 max-w-2xl text-4xl text-ink sm:text-5xl">{tp("heroTitle")}</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/75">{tp("heroText")}</p>
          <div className="mt-6 rounded-card-lg bg-white p-5 shadow-sm">
            <p className="text-sm text-ink/70">{t("liveTotalLabel")}</p>
            <p className="text-2xl font-extrabold text-forest">
              {formatEuro(cfg.defaultUnitPriceCents, lang)} <span className="text-base font-semibold text-ink/70">{t("perUnitMonth", { unit: cfg.unit[lang] })} · {t("exclBtw")}</span>
            </p>
            <p className="mt-1 text-sm text-ink/70">{tp("example", { units: exampleUnits, fee: formatEuro(example.netCents, lang) })}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`/business/signup?type=${bt}`} withArrow>{t("heroCta")}</ButtonLink>
            <ButtonLink href={`/search?jobType=${bt}`} variant="secondary">{t("browseCleaners")}</ButtonLink>
          </div>
          <p className="mt-4 text-sm font-semibold text-forest">{t("noCommission")}</p>
        </div>
        {hasPhoto ? (
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[2rem] shadow-xl shadow-forest/10">
            <Image src={`/img/business-${bt}.webp`} alt="" fill sizes="(min-width: 768px) 480px, 100vw" className="object-cover" />
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
            <div className="mt-3"><DemoScreen type={bt} lang={lang} /></div>
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
