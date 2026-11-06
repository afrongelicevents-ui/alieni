"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";

/** Segment error boundary: something threw while rendering a page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="text-ink/70">{t("text")}</p>
      {error.digest ? <p className="font-mono text-xs text-ink/50">{error.digest}</p> : null}
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark">
          {t("retry")}
        </button>
        <ButtonLink href="/" variant="secondary">{t("home")}</ButtonLink>
      </div>
    </section>
  );
}
