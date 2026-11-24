import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/guard";
import { TwoFactorSetup } from "@/components/account/TwoFactorSetup";

export const dynamic = "force-dynamic";

/** Two-step login (TOTP authenticator app). Required for admins before any admin page works; optional for others. */
export default async function TwoFactorPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent("/account/two-factor")}`);
  const t = await getTranslations("twoFactor");
  const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : homeFor(user.role);

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="mt-2 text-sm text-ink/70">{user.role === "admin" ? t("introAdmin") : t("intro")}</p>
      <div className="mt-6">
        <TwoFactorSetup enabled={user.twoFactorEnabled} next={`/${locale}${safe}`} />
      </div>
    </section>
  );
}
