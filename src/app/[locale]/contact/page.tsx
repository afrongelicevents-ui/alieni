import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { COMPANY } from "@/lib/company";

const EMAIL = COMPANY.contactEmail || null;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const tMeta = await getTranslations({ locale, namespace: "site.contactPage" });
  return { title: tMeta("title") };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site.contactPage");

  return (
    <article className="bg-page">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h1 className="headline text-4xl text-navy sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 text-lg text-body">{t("intro")}</p>
        <div className="mt-6 rounded-2xl border border-edge bg-white p-6">
          {EMAIL ? (
            <p className="text-navy">
              {t("email")}{" "}
              <a href={`mailto:${EMAIL}`} className="font-bold text-royal underline underline-offset-2">{EMAIL}</a>
            </p>
          ) : (
            <p className="text-body">{t("noEmail")}</p>
          )}
        </div>
        <h2 id="report" className="headline mt-12 scroll-mt-24 text-2xl text-navy">{t("reportTitle")}</h2>
        <p className="mt-3 leading-relaxed text-body">{t("report")}</p>
      </div>
    </article>
  );
}
