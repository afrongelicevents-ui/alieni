import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/money";

/** `feeCents` is the household monthly price while one is active; null keeps the copy price-neutral. */
export function HowItWorks({ feeCents = null }: { feeCents?: number | null }) {
  const t = useTranslations("home");
  const lang = useLocale();

  const steps = [
    { title: t("howStep1Title"), text: t("howStep1Text") },
    { title: t("howStep2Title"), text: t("howStep2Text") },
    { title: t("howStep3Title"), text: feeCents ? t("howStep3TextPriced", { fee: formatEuro(feeCents, lang) }) : t("howStep3Text") },
  ];

  return (
    <section className="bg-section">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="headline text-center text-2xl text-ink sm:text-3xl">{t("howTitle")}</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sun text-lg font-extrabold text-white">
                {i + 1}
              </span>
              <h3 className="text-lg font-extrabold text-ink">{step.title}</h3>
              <p className="max-w-xs text-sm text-ink/70">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
