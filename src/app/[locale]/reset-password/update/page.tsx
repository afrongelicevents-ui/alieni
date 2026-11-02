import { getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordReset } from "@/components/auth/PasswordReset";

export default async function ResetPasswordUpdatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("resetUpdateTitle")}</h1>
      <div className="mt-6">
        <PasswordReset mode="update" />
      </div>
    </section>
  );
}
