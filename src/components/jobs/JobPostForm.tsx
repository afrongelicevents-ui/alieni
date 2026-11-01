"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FREQUENCY_LABELS, JOB_POST_PRICE_EXCL_BTW_CENTS, SPACE_TYPE_LABELS, type Frequency, type SpaceType } from "@/lib/jobs";
import { useJobsStore } from "@/lib/jobs-store";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { formatEuro } from "@/lib/money";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function JobPostForm() {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { postJob } = useJobsStore();

  const [companyName, setCompanyName] = useState("");
  const [spaceType, setSpaceType] = useState<SpaceType>("office");
  const [sizeM2, setSizeM2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [scheduleNote, setScheduleNote] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("18,00");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!companyName.trim()) next.companyName = t("requiredError");
    const postcodeParsed = dutchPostcodeSchema.safeParse(postcode);
    if (!postcodeParsed.success) next.postcode = t("postcodeError");
    if (description.trim().length < 10) next.description = t("descriptionError");
    const budgetCents = Math.round(Number(budget.replace(",", ".")) * 100);
    if (!Number.isFinite(budgetCents) || budgetCents < DEFAULT_RATE_FLOOR_CENTS) next.budget = t("rateError");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    postJob({
      companyName: companyName.trim(),
      spaceType,
      sizeM2: sizeM2 ? Math.max(1, Math.round(Number(sizeM2))) : null,
      postcode: postcodeParsed.success ? postcodeParsed.data : postcode,
      city: city.trim(),
      frequency,
      scheduleNote: scheduleNote.trim() || null,
      description: description.trim(),
      budgetCents,
    });
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="rounded-card-lg bg-mint p-8 text-center">
        <h2 className="headline text-2xl text-ink">{t("savedTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink/70">{t("savedText")}</p>
        <Link
          href="/jobs"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-6 text-sm font-bold text-forest hover:bg-white"
        >
          {t("viewBoard")}
        </Link>
      </div>
    );
  }

  const err = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[key]}</p> : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-card-lg border border-line bg-white p-6">
      <label className="text-sm font-semibold text-ink/80">
        {t("companyLabel")}
        <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={120} className={`mt-1 ${inputCls}`} />
        {err("companyName")}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">
          {t("spaceTypeLabel")}
          <select value={spaceType} onChange={(e) => setSpaceType(e.target.value as SpaceType)} className={`mt-1 ${inputCls}`}>
            {Object.entries(SPACE_TYPE_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>
                {labels[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("sizeLabel")}
          <input type="number" min={1} value={sizeM2} onChange={(e) => setSizeM2(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">
          {t("postcodeLabel")}
          <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="1012 AB" className={`mt-1 ${inputCls}`} />
          <p className="mt-1 text-xs font-medium text-ink/70">{t("areaNote")}</p>
          {err("postcode")}
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("cityLabel")}
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} className={`mt-1 ${inputCls}`} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">
          {t("frequencyLabel")}
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={`mt-1 ${inputCls}`}>
            {Object.entries(FREQUENCY_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>
                {labels[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("budgetLabel")}
          <input type="text" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={`mt-1 ${inputCls}`} />
          {err("budget")}
        </label>
      </div>

      <label className="text-sm font-semibold text-ink/80">
        {t("scheduleLabel")}
        <input
          type="text"
          value={scheduleNote}
          onChange={(e) => setScheduleNote(e.target.value)}
          placeholder={t("schedulePlaceholder")}
          maxLength={300}
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="text-sm font-semibold text-ink/80">
        {t("descriptionLabel")}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} className={`mt-1 ${inputCls}`} />
        {err("description")}
      </label>

      <p className="rounded-xl bg-sun/25 p-3 text-xs text-ink/80">
        {t("payNote", { price: formatEuro(JOB_POST_PRICE_EXCL_BTW_CENTS, lang) })}
      </p>

      <button
        type="submit"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-ink hover:bg-sun-dark"
      >
        {t("submit", { price: formatEuro(JOB_POST_PRICE_EXCL_BTW_CENTS, lang) })}
      </button>
    </form>
  );
}
