import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { locale } = await params;
  const { role, next } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const defaultRole = role === "cleaner" || role === "business" ? role : "household";

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("signupTitle")}</h1>
      {defaultRole === "cleaner" ? <p className="mt-2 text-ink/70">{t("cleanerSignupIntro")}</p> : null}
      <div className="mt-6">
        <AuthForm mode="signup" defaultRole={defaultRole} next={next} />
      </div>
    </section>
  );
}
