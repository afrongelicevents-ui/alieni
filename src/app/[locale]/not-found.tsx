"use client";

import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="headline text-3xl text-ink">{t("notFoundTitle")}</h1>
      <p className="text-ink/70">{t("notFoundText")}</p>
      <ButtonLink href="/" variant="dark" className="mt-2">{t("home")}</ButtonLink>
    </section>
  );
}
