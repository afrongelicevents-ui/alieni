import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("loginTitle")}</h1>
      <div className="mt-6">
        <AuthForm mode="login" />
      </div>
    </section>
  );
}
