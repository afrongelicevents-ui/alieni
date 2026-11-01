"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, type BusinessType } from "@/lib/business";

/**
 * Platform settings (brief §8 + business v2 §10): household price, the five
 * business unit prices, emergency fee, linen add-on, rate floor, banned
 * words. Maps onto the `settings` table; stored locally in demo mode.
 */
type Settings = {
  householdPriceEuro: string;
  unitPrices: Record<BusinessType, string>;
  emergencyHouseholdEuro: string;
  emergencyBusinessEuro: string;
  linenEnabled: boolean;
  linenPriceEuro: string;
  rateFloorEuro: string;
  vogMaxAgeMonths: string;
  bannedWords: string;
};

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const DEFAULTS: Settings = {
  householdPriceEuro: "14,95",
  unitPrices: Object.fromEntries(BUSINESS_TYPE_KEYS.map((k) => [k, euro(BUSINESS_TYPES[k].defaultUnitPriceCents)])) as Record<BusinessType, string>,
  emergencyHouseholdEuro: "9,95",
  emergencyBusinessEuro: "14,95",
  linenEnabled: false,
  linenPriceEuro: "4,00",
  rateFloorEuro: "15,00",
  vogMaxAgeMonths: "12",
  bannedWords: "",
};

const KEY = "alieni.admin-settings";
const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function SettingsForm() {
  const t = useTranslations("admin");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // One-time hydration from localStorage; cannot run during SSR render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw), unitPrices: { ...DEFAULTS.unitPrices, ...(JSON.parse(raw).unitPrices ?? {}) } });
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

  const field = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <label className="text-sm font-semibold text-ink/80">
      {label}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1 ${inputCls}`} />
      {hint ? <p className="mt-1 text-xs font-medium text-ink/70">{hint}</p> : null}
    </label>
  );

  return (
    <form onSubmit={save} className="max-w-xl">
      <h2 className="headline text-xl text-ink">{t("tabSettings")}</h2>

      <div className="mt-4 flex flex-col gap-6 rounded-card-lg border border-line bg-white p-6">
        {field(t("settingHouseholdPrice"), settings.householdPriceEuro, (v) => update({ householdPriceEuro: v }), t("settingHouseholdPriceHint"))}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-extrabold text-ink">{t("settingBusinessPrices")}</legend>
          <p className="text-xs text-ink/70">{t("settingBusinessPricesHint")}</p>
          {BUSINESS_TYPE_KEYS.map((type) =>
            field(
              `${BUSINESS_TYPES[type].label[lang]} — € / ${BUSINESS_TYPES[type].unit[lang]} / ${t("perMonth")}`,
              settings.unitPrices[type],
              (v) => update({ unitPrices: { ...settings.unitPrices, [type]: v } }),
            ),
          )}
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-extrabold text-ink">{t("settingEmergency")}</legend>
          {field(t("settingEmergencyHousehold"), settings.emergencyHouseholdEuro, (v) => update({ emergencyHouseholdEuro: v }))}
          {field(t("settingEmergencyBusiness"), settings.emergencyBusinessEuro, (v) => update({ emergencyBusinessEuro: v }))}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-extrabold text-ink">{t("settingLinen")}</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink/80">
            <input type="checkbox" checked={settings.linenEnabled} onChange={(e) => update({ linenEnabled: e.target.checked })} className="h-5 w-5 accent-forest" />
            {t("settingLinenEnabled")}
          </label>
          {field(t("settingLinenPrice"), settings.linenPriceEuro, (v) => update({ linenPriceEuro: v }), t("settingLinenHint"))}
        </fieldset>

        {field(t("settingRateFloor"), settings.rateFloorEuro, (v) => update({ rateFloorEuro: v }), t("settingRateFloorHint"))}
        {field(t("settingVogMaxAge"), settings.vogMaxAgeMonths, (v) => update({ vogMaxAgeMonths: v }), t("settingVogMaxAgeHint"))}

        <label className="text-sm font-semibold text-ink/80">
          {t("settingBannedWords")}
          <textarea value={settings.bannedWords} onChange={(e) => update({ bannedWords: e.target.value })} rows={3} placeholder={t("settingBannedWordsHint")} className={`mt-1 ${inputCls}`} />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark">
            {t("save")}
          </button>
          {saved ? <span className="text-sm font-semibold text-forest">{t("savedNote")}</span> : null}
        </div>
      </div>
    </form>
  );
}
