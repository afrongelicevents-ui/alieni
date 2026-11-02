import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { RoleChooser } from "@/components/auth/RoleChooser";

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
  const chosen = role === "cleaner" || role === "household" ? role : null;

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      {chosen ? (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-forest">{t(`choose_${chosen}_title` as "choose_household_title")}</p>
          <h1 className="headline mt-1 text-3xl text-ink">{t("signupTitle")}</h1>
          <p className="mt-2 text-ink/70">{chosen === "cleaner" ? t("cleanerSignupIntro") : t("householdSignupIntro")}</p>
          <div className="mt-6">
            <AuthForm mode="signup" defaultRole={chosen} next={next ?? (chosen === "cleaner" ? "/profile" : "/home")} />
          </div>
          <p className="mt-4 text-center text-sm"><Link href="/signup" className="font-semibold text-forest underline">{t("chooseOther")}</Link></p>
        </>
      ) : (
        <>
          <h1 className="headline text-3xl text-ink">{t("chooseTitle")}</h1>
          <p className="mt-2 text-ink/70">{t("chooseIntro")}</p>
          <div className="mt-6"><RoleChooser next={next} /></div>
          <p className="mt-6 text-center text-sm text-ink/70">{t("haveAccount")} <Link href="/login" className="font-bold text-forest underline">{t("loginTitle")}</Link></p>
        </>
      )}
    </section>
  );
}
