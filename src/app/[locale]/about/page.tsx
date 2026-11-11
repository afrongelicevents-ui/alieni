import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPublicHouseholdFeeCents } from "@/lib/site-settings";
import { formatEuro } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const tMeta = await getTranslations({ locale, namespace: "site.aboutPage" });
  return { title: tMeta("title"), description: tMeta("intro") };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site");
  // Prices only appear while charging is active (payments on + a price set); otherwise the copy stays price-neutral.
  const feeCents = await getPublicHouseholdFeeCents();
  const steps = t.raw("aboutPage.steps") as { t: string; d: string }[];

  return (
    <article className="bg-page">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h1 className="headline text-4xl text-navy sm:text-5xl">{t("aboutPage.title")}</h1>
        <p className="mt-4 text-lg leading-relaxed text-body">{t("aboutPage.intro")}</p>

        <h2 id="how-it-works" className="headline mt-12 scroll-mt-24 text-2xl text-navy">{t("aboutPage.howTitle")}</h2>
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => (
            <li key={s.t} className="flex gap-4 rounded-2xl border border-edge bg-white p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
              <div>
                <h3 className="font-bold text-navy">{s.t}</h3>
                <p className="mt-1 text-body">{i === 2 && feeCents ? t("aboutPage.step3Priced", { price: formatEuro(feeCents, locale) }) : s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="headline mt-12 text-2xl text-navy">{t("aboutPage.earnTitle")}</h2>
        <p className="mt-3 leading-relaxed text-body">{t("aboutPage.earn")}</p>

        <h2 className="headline mt-10 text-2xl text-navy">{t("aboutPage.notTitle")}</h2>
        <p className="mt-3 leading-relaxed text-body">{t("aboutPage.not")}</p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/search" className="inline-flex min-h-12 items-center rounded-full bg-royal px-6 font-bold text-white hover:bg-royal-dark">{t("hero.find")}</Link>
          <Link href="/contact" className="inline-flex min-h-12 items-center rounded-full border-[1.5px] border-navy px-6 font-bold text-navy hover:bg-tint">{t("nav.contact")}</Link>
        </div>
      </div>
    </article>
  );
}
