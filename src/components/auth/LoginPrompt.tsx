import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";

/** Shown on account-only pages while signed out. */
export async function LoginPrompt({ next, text }: { next: string; text?: string }) {
  const t = await getTranslations("auth");
  return (
    <div className="flex flex-col items-center gap-4 rounded-card-lg border border-line bg-white px-6 py-12 text-center">
      <p className="max-w-sm text-ink/70">{text ?? t("loginRequired")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href={`/login?next=${encodeURIComponent(next)}`}>{t("loginTitle")}</ButtonLink>
        <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} variant="secondary">{t("signupTitle")}</ButtonLink>
      </div>
    </div>
  );
}
