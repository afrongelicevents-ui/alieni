import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";
import { redirectIfSignedIn } from "@/lib/guard";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ confirmed?: string; next?: string }>;
}) {
  const { locale } = await params;
  const { confirmed, next } = await searchParams;
  setRequestLocale(locale);
  await redirectIfSignedIn(locale, next);
  const t = await getTranslations("auth");

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("loginTitle")}</h1>
      {confirmed ? (
        <p className="mt-4 rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{t("confirmedNotice")}</p>
      ) : null}
      <div className="mt-6">
        <AuthForm mode="login" next={next} />
      </div>
    </section>
  );
}
