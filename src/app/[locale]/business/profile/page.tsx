import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessSubnav } from "@/components/business/BusinessSubnav";
import { BusinessTypeIcon } from "@/components/business/BusinessTypeCard";
import { UnitsManager } from "@/components/business/UnitsManager";
import { BUSINESS_TYPES } from "@/lib/business";
import { loadBusinessPage } from "@/lib/business-page";

export const dynamic = "force-dynamic";

export default async function BusinessProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("business");
  const lang = ((await getLocale()) === "en" ? "en" : "nl") as "nl" | "en";
  const { bundle } = await loadBusinessPage(locale, "/business/profile");
  const p = bundle.profile;
  const type = p.business_type ?? "office";
  const cfg = BUSINESS_TYPES[type];
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("profileTitle")}</h1>
      <BusinessSubnav />
      <p className="mt-4 text-sm text-ink/70">{t("profileIntro")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-card-lg border border-line bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><BusinessTypeIcon type={type} className="h-7 w-7" /></span>
        <dl className="min-w-0 flex-1 text-sm">
          <dt className="sr-only">{t("companyName")}</dt><dd className="text-lg font-extrabold text-ink">{p.company_name}</dd>
          <dd className="text-ink/70">{cfg.label[lang]}{p.btw_number ? ` · BTW ${p.btw_number}` : ""}</dd>
          <dd className="text-ink/70">{[p.contact_first_name, p.contact_last_name].filter(Boolean).join(" ")}</dd>
        </dl>
      </div>
      <div className="mt-6"><UnitsManager bundle={bundle} /></div>
    </section>
  );
}
