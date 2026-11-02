import { getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordReset } from "@/components/auth/PasswordReset";

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("resetTitle")}</h1>
      <p className="mt-2 text-sm text-ink/70">{t("resetIntro")}</p>
      <div className="mt-6">
        <PasswordReset mode="request" />
      </div>
    </section>
  );
}
