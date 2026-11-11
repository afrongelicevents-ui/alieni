import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWebsiteSettings, isModuleKey, MODULE_KEYS } from "@/lib/site-settings";
import { routing } from "@/i18n/routing";
import { NotifyForm } from "./NotifyForm";

export const metadata: Metadata = { robots: { index: false } };
export const revalidate = 300;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => MODULE_KEYS.map((module) => ({ locale, module })));
}

/** "Coming soon — notify me" page for a module behind an admin switch (brief §7). */
export default async function NotifyPage({ params }: { params: Promise<{ locale: string; module: string }> }) {
  const { locale, module } = await params;
  if (!isModuleKey(module)) notFound();
  setRequestLocale(locale);
  const { modules } = await getWebsiteSettings();
  if (modules[module].live && modules[module].url) redirect(modules[module].url);
  const t = await getTranslations("site");

  return (
    <section className="bg-page">
      <div className="mx-auto max-w-xl px-5 py-14 sm:py-20">
        <span className="inline-flex rounded-full bg-navy px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{t("soon")}</span>
        <h1 className="headline mt-4 text-3xl text-navy sm:text-4xl">{t("notify.title", { module: t(`modules.${module}`) })}</h1>
        <p className="mt-3 text-body">{t("notify.text")}</p>
        <NotifyForm module={module} />
      </div>
    </section>
  );
}
