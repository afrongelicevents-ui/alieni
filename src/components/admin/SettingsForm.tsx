"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Platform settings (brief §8): household price, business pricing model
 * (open decision §13 — built configurable), minimum hourly rate (changes
 * with the Dutch minimum wage every 1 Jan / 1 Jul), banned words.
 * Maps 1:1 onto the `settings` table; stored locally in demo mode.
 */
type Settings = {
  householdPriceEuro: string;
  businessModel: "per_job" | "subscription";
  businessPriceEuro: string;
  rateFloorEuro: string;
  bannedWords: string;
};

const DEFAULTS: Settings = {
  householdPriceEuro: "14,95",
  businessModel: "per_job",
  businessPriceEuro: "9,95",
  rateFloorEuro: "15,00",
  bannedWords: "",
};

const KEY = "alieni.admin-settings";
const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function SettingsForm() {
  const t = useTranslations("admin");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // One-time hydration from localStorage; cannot run during SSR render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore corrupt settings
    }
  }, []);

  function update(partial: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable
    }
    setSaved(true);
  }

  return (
    <form onSubmit={save} className="max-w-xl">
      <h2 className="headline text-xl text-ink">{t("tabSettings")}</h2>

      <div className="mt-4 flex flex-col gap-5 rounded-card-lg border border-line bg-white p-6">
        <label className="text-sm font-semibold text-ink/80">
          {t("settingHouseholdPrice")}
          <input
            type="text"
            inputMode="decimal"
            value={settings.householdPriceEuro}
            onChange={(e) => update({ householdPriceEuro: e.target.value })}
            className={`mt-1 ${inputCls}`}
          />
          <p className="mt-1 text-xs font-medium text-ink/70">{t("settingHouseholdPriceHint")}</p>
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-ink/80">{t("settingBusinessModel")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["per_job", "subscription"] as const).map((model) => (
              <label
                key={model}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border-2 px-4 text-sm font-bold ${
                  settings.businessModel === model ? "border-forest bg-mint text-forest" : "border-line text-ink/70"
                }`}
              >
                <input
                  type="radio"
                  name="business-model"
                  checked={settings.businessModel === model}
                  onChange={() => update({ businessModel: model })}
                  className="sr-only"
                />
                {model === "per_job" ? t("businessPerJob") : t("businessSubscription")}
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm font-semibold text-ink/80">
            {t("settingBusinessPrice")}
            <input
              type="text"
              inputMode="decimal"
              value={settings.businessPriceEuro}
              onChange={(e) => update({ businessPriceEuro: e.target.value })}
              className={`mt-1 ${inputCls}`}
            />
            <p className="mt-1 text-xs font-medium text-ink/70">{t("settingBusinessPriceHint")}</p>
          </label>
        </fieldset>

        <label className="text-sm font-semibold text-ink/80">
          {t("settingRateFloor")}
          <input
            type="text"
            inputMode="decimal"
            value={settings.rateFloorEuro}
            onChange={(e) => update({ rateFloorEuro: e.target.value })}
            className={`mt-1 ${inputCls}`}
          />
          <p className="mt-1 text-xs font-medium text-ink/70">{t("settingRateFloorHint")}</p>
        </label>

        <label className="text-sm font-semibold text-ink/80">
          {t("settingBannedWords")}
          <textarea
            value={settings.bannedWords}
            onChange={(e) => update({ bannedWords: e.target.value })}
            rows={3}
            placeholder={t("settingBannedWordsHint")}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark"
          >
            {t("save")}
          </button>
          {saved ? <span className="text-sm font-semibold text-forest">{t("savedNote")}</span> : null}
        </div>
      </div>
    </form>
  );
}
