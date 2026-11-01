import { getTranslations, setRequestLocale } from "next-intl/server";
import { BusinessSignup } from "@/components/business/BusinessSignup";
import { BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";

export default async function BusinessSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { type } = await searchParams;
  const t = await getTranslations("business");
  const initialType = BUSINESS_TYPE_KEYS.includes(type as BusinessType) ? (type as BusinessType) : undefined;

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("signupTitle")}</h1>
      <p className="mt-2 text-ink/70">{t("signupIntro")}</p>
      <div className="mt-6">
        <BusinessSignup initialType={initialType} />
      </div>
    </section>
  );
}
