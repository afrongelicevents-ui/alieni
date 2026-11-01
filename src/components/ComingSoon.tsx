import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";

export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations("common");

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="headline text-3xl text-ink">{title}</h1>
      <p className="text-ink/70">{t("comingSoonText")}</p>
      <ButtonLink href="/" variant="secondary">
        {t("backHome")}
      </ButtonLink>
    </section>
  );
}
