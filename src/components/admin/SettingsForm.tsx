"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { saveSettings } from "@/app/[locale]/admin/actions";

/**
 * Platform settings (brief §8 + business v2 §10): household price, the five
 * business unit prices, emergency fee, linen add-on, rate floor, banned
 * words. Maps onto the `settings` table; stored locally in demo mode.
 */
export type Settings = {
  householdPriceEuro: string;
  coverCancelHours: string;
  coverStrikeLimit: string;
  coverMaxDays: string;
  emergencyHouseholdEuro: string;
  emergencyBusinessEuro: string;
  linenEnabled: boolean;
  linenPriceEuro: string;
  rateFloorEuro: string;
  vogMaxAgeMonths: string;
  bannedWords: string;
  videoUrl: string;
};

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const DEFAULTS: Settings = {
  householdPriceEuro: "14,95",
  coverCancelHours: "4",
  coverStrikeLimit: "2",
  coverMaxDays: "14",
  emergencyHouseholdEuro: "9,95",
  emergencyBusinessEuro: "14,95",
  linenEnabled: false,
  linenPriceEuro: "4,00",
  rateFloorEuro: "15,00",
  vogMaxAgeMonths: "12",
  bannedWords: "",
  videoUrl: "",
};

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function SettingsForm({ initial, demo }: { initial: Settings | null; demo: boolean }) {
  const t = useTranslations("admin");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const [settings, setSettings] = useState<Settings>(initial ? { ...DEFAULTS, ...initial } : DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(partial: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (demo) {
      setSaved(true);
      return;
    }
    setBusy(true);
    const r = await saveSettings(settings);
    setBusy(false);
    if (r.ok) setSaved(true);
    else setError(r.error === "invalid" ? t("settingsInvalid") : r.error === "invalid_video" ? t("settingVideoInvalid") : t("actionFailed"));
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

        <div className="rounded-xl bg-mint/60 p-4 text-sm text-ink/80">
          <p className="font-extrabold text-ink">{t("settingBusinessPrices")}</p>
          <p className="mt-1 text-xs">{t("settingBusinessPricesMoved")}</p>
          <Link href="/admin/pricing" className="mt-2 inline-block text-xs font-bold text-forest underline">{t("goPricing")}</Link>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-extrabold text-ink">{t("settingEmergency")}</legend>
          {field(t("settingEmergencyHousehold"), settings.emergencyHouseholdEuro, (v) => update({ emergencyHouseholdEuro: v }))}
          {field(t("settingEmergencyBusiness"), settings.emergencyBusinessEuro, (v) => update({ emergencyBusinessEuro: v }))}
          <p className="text-xs text-ink/70 sm:col-span-2">{t("settingEmergencyHint")}</p>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-extrabold text-ink">{t("settingCover")}</legend>
          {field(t("settingCoverCancel"), settings.coverCancelHours, (v) => update({ coverCancelHours: v }))}
          {field(t("settingCoverStrikes"), settings.coverStrikeLimit, (v) => update({ coverStrikeLimit: v }))}
          {field(t("settingCoverDays"), settings.coverMaxDays, (v) => update({ coverMaxDays: v }))}
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

        <label className="text-sm font-semibold text-ink/80">
          {t("settingVideo")}
          <input type="url" inputMode="url" value={settings.videoUrl} onChange={(e) => update({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" className={`mt-1 ${inputCls}`} />
          <p className="mt-1 text-xs font-medium text-ink/70">{t("settingVideoHint")}</p>
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark disabled:opacity-50">
            {t("save")}
          </button>
          {saved ? <span className="text-sm font-semibold text-forest">{t("savedNote")}</span> : null}
          {error ? <span className="text-sm font-semibold text-red-700">{error}</span> : null}
        </div>
      </div>
    </form>
  );
}
