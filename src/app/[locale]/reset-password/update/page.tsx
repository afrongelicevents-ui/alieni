import { getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordReset } from "@/components/auth/PasswordReset";

export default async function ResetPasswordUpdatePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string; error?: string }> }) {
  const { locale } = await params;
  const { token, error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("resetUpdateTitle")}</h1>
      <div className="mt-6">
        <PasswordReset mode="update" resetToken={typeof token === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(token) ? token : null} resetError={typeof error === "string" ? error : null} />
      </div>
    </section>
  );
}
