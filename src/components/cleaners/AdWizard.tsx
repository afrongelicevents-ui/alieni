"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_RATE_FLOOR_CENTS, dutchPostcodeSchema } from "@/lib/validation";
import { LANGUAGE_LABELS, SERVICE_LABELS, type DayBlock, type Weekday } from "@/lib/sample-data";

/**
 * 3-step cleaner ad wizard (brief §5). Drafts are stored locally and map
 * 1:1 onto the `cleaner_profiles` + `availability_slots` tables, so they
 * publish automatically once accounts are live.
 */

type Draft = {
  name: string;
  city: string;
  about: string;
  services: string[];
  languages: string[];
  rateEuro: string;
  minHours: number;
  postcode: string;
  radiusKm: number;
  availability: Partial<Record<Weekday, DayBlock[]>>;
};

const EMPTY: Draft = {
  name: "",
  city: "",
  about: "",
  services: [],
  languages: ["nl"],
  rateEuro: "17,50",
  minHours: 2,
  postcode: "",
  radiusKm: 10,
  availability: {},
};

const DRAFT_KEY = "alieni.cleaner-ad-draft";
const BLOCKS: DayBlock[] = ["morning", "afternoon", "evening"];

function parseRateCents(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  const euro = Number(normalized);
  if (!Number.isFinite(euro)) return null;
  return Math.round(euro * 100);
}

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";
const chipCls = (on: boolean) =>
  `min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
    on ? "border-forest bg-forest text-white" : "border-line bg-white text-ink/80 hover:bg-mint"
  }`;

export function AdWizard() {
  const t = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      // One-time hydration from localStorage; cannot run during SSR render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDraft({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // ignore corrupt drafts
    }
  }, []);

  function persist(next: Draft) {
    setDraft(next);
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — draft lives in memory only
    }
  }

  function toggleIn<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  function toggleBlock(day: Weekday, block: DayBlock) {
    const current = draft.availability[day] ?? [];
    const next = current.includes(block) ? current.filter((b) => b !== block) : [...current, block];
    persist({ ...draft, availability: { ...draft.availability, [day]: next } });
  }

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!draft.name.trim()) e.name = t("nameError");
    }
    if (s === 1) {
      if (draft.services.length === 0) e.services = t("servicesError");
      const cents = parseRateCents(draft.rateEuro);
      if (cents === null || cents < DEFAULT_RATE_FLOOR_CENTS) e.rate = t("rateError");
    }
    if (s === 2) {
      if (!dutchPostcodeSchema.safeParse(draft.postcode).success) e.postcode = t("postcodeError");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    if (step < 2) setStep(step + 1);
    else setSaved(true);
  }

  if (saved) {
    return (
      <div className="rounded-card-lg bg-mint p-8 text-center">
        <h2 className="headline text-2xl text-ink">{t("savedTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink/70">{t("savedText")}</p>
        <button
          type="button"
          onClick={() => setSaved(false)}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-6 text-sm font-bold text-forest hover:bg-white"
        >
          {t("editAgain")}
        </button>
      </div>
    );
  }

  const stepTitles = [t("step1"), t("step2"), t("step3")];

  return (
    <div>
      {/* step indicator */}
      <ol className="flex items-center gap-2">
        {stepTitles.map((title, i) => (
          <li key={title} className="flex flex-1 flex-col items-center gap-1">
            <span
              aria-current={i === step ? "step" : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${
                i < step ? "bg-forest text-white" : i === step ? "bg-sun text-ink" : "bg-section text-ink/70"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-center text-xs font-semibold ${i === step ? "text-ink" : "text-ink/70"}`}>
              {title}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-card-lg border border-line bg-white p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <label className="text-sm font-semibold text-ink/80">
              {t("nameLabel")}
              <input
                type="text"
                value={draft.name}
                onChange={(e) => persist({ ...draft, name: e.target.value })}
                maxLength={80}
                className={`mt-1 ${inputCls}`}
              />
              {errors.name ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.name}</p> : null}
            </label>
            <label className="text-sm font-semibold text-ink/80">
              {t("cityLabel")}
              <input
                type="text"
                value={draft.city}
                onChange={(e) => persist({ ...draft, city: e.target.value })}
                maxLength={60}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="text-sm font-semibold text-ink/80">
              {t("aboutLabel")}
              <textarea
                value={draft.about}
                onChange={(e) => persist({ ...draft, about: e.target.value })}
                placeholder={t("aboutPlaceholder")}
                maxLength={2000}
                rows={4}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <p className="rounded-xl bg-section p-3 text-xs text-ink/70">{t("photoNote")}</p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("servicesLabel")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(SERVICE_LABELS).map(([key, labels]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={draft.services.includes(key)}
                    onClick={() => persist({ ...draft, services: toggleIn(draft.services, key) })}
                    className={chipCls(draft.services.includes(key))}
                  >
                    {labels[locale]}
                  </button>
                ))}
              </div>
              {errors.services ? <p className="mt-2 text-xs font-semibold text-red-700">{errors.services}</p> : null}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-ink/80">
                {t("rateLabel")}
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.rateEuro}
                  onChange={(e) => persist({ ...draft, rateEuro: e.target.value })}
                  className={`mt-1 ${inputCls}`}
                />
                <p className="mt-1 text-xs font-medium text-ink/70">{t("rateHint")}</p>
                {errors.rate ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.rate}</p> : null}
              </label>
              <label className="text-sm font-semibold text-ink/80">
                {t("minHoursLabel")}
                <select
                  value={draft.minHours}
                  onChange={(e) => persist({ ...draft, minHours: Number(e.target.value) })}
                  className={`mt-1 ${inputCls}`}
                >
                  {[1, 2, 3, 4, 5, 6].map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("languagesLabel")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(LANGUAGE_LABELS).map(([key, labels]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={draft.languages.includes(key)}
                    onClick={() => persist({ ...draft, languages: toggleIn(draft.languages, key) })}
                    className={chipCls(draft.languages.includes(key))}
                  >
                    {labels[locale]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-ink/80">
                {t("postcodeLabel")}
                <input
                  type="text"
                  value={draft.postcode}
                  onChange={(e) => persist({ ...draft, postcode: e.target.value })}
                  placeholder="1012 AB"
                  autoComplete="postal-code"
                  className={`mt-1 ${inputCls}`}
                />
                {errors.postcode ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.postcode}</p> : null}
              </label>
              <label className="text-sm font-semibold text-ink/80">
                {t("radiusLabel")}: <output className="font-extrabold text-forest">{draft.radiusKm} km</output>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={draft.radiusKm}
                  onChange={(e) => persist({ ...draft, radiusKm: Number(e.target.value) })}
                  className="mt-3 w-full accent-forest"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("availabilityLabel")}</legend>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-xs">
                  <thead>
                    <tr>
                      <th aria-hidden="true" className="w-20" />
                      {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
                        <th key={d} scope="col" className="pb-1 font-bold text-ink/70">
                          {tCommon(`day${d}` as "day0").slice(0, 2)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {BLOCKS.map((block) => (
                      <tr key={block}>
                        <th scope="row" className="pr-2 text-left font-semibold text-ink/70">
                          {tCommon(block)}
                        </th>
                        {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => {
                          const on = (draft.availability[d] ?? []).includes(block);
                          return (
                            <td key={d}>
                              <button
                                type="button"
                                aria-pressed={on}
                                aria-label={`${tCommon(`day${d}` as "day0")} ${tCommon(block)}`}
                                onClick={() => toggleBlock(d, block)}
                                className={`block h-9 w-full rounded-lg transition-colors ${
                                  on ? "bg-forest" : "bg-section hover:bg-mint"
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-6 text-sm font-bold text-ink/70 disabled:opacity-40"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={next}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-sun px-8 text-sm font-bold text-ink hover:bg-sun-dark"
        >
          {step === 2 ? t("publish") : t("next")}
        </button>
      </div>
    </div>
  );
}
