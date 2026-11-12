"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { saveSettings } from "@/app/[locale]/admin/actions";
import { BUSINESS_PRICING_MODELS, MAX_TIERS, type BusinessPricingForm } from "@/lib/business-pricing";

/**
 * Platform settings (brief §8 + business v2 §10): sign-ups (pre-launch mode), household price,
 * business pricing model, emergency fee, cover rules, linen add-on, rate floor, VOG age, banned
 * words, homepage video. Maps onto the `settings` table; stored locally in demo mode.
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
  businessPricing: BusinessPricingForm;
  /** Pre-launch mode: sign-up screens closed, logging in still works. */
  signupsPaused?: boolean;
};

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const DEFAULTS: Settings = {
  householdPriceEuro: "0,00",
  coverCancelHours: "4",
  coverStrikeLimit: "2",
  coverMaxDays: "14",
  emergencyHouseholdEuro: "0,00",
  emergencyBusinessEuro: "0,00",
  linenEnabled: false,
  linenPriceEuro: "0,00",
  rateFloorEuro: "15,00",
  vogMaxAgeMonths: "12",
  bannedWords: "",
  videoUrl: "",
  businessPricing: { model: "per_location", jobPostEuro: "", tiers: [] },
  signupsPaused: false,
};

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function SettingsForm({ initial, demo }: { initial: Settings | null; demo: boolean }) {
  const t = useTranslations("admin");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const [settings, setSettings] = useState<Settings>(initial ? { ...DEFAULTS, ...initial } : DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bp = settings.businessPricing;
  const setBp = (partial: Partial<BusinessPricingForm>) => update({ businessPricing: { ...settings.businessPricing, ...partial } });
  const setTier = (i: number, partial: Partial<BusinessPricingForm["tiers"][number]>) =>
    setBp({ tiers: settings.businessPricing.tiers.map((row, j) => (j === i ? { ...row, ...partial } : row)) });

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
    else setError(r.error === "invalid" ? t("settingsInvalid") : r.error === "invalid_video" ? t("settingVideoInvalid") : r.error === "invalid_business_pricing" ? t("bp_invalid") : t("actionFailed"));
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
        {/* Pre-launch mode: closes the sign-up screens (household, cleaner, business). Logging in keeps working. */}
        <fieldset className="rounded-xl bg-section p-4 text-sm text-ink/80" data-signups>
          <legend className="sr-only">{t("signupsTitle")}</legend>
          <p className="font-extrabold text-ink" aria-hidden="true">{t("signupsTitle")}</p>
          <label className="mt-2 flex min-h-11 items-center gap-3 font-bold text-ink">
            <input type="checkbox" name="signups-paused" checked={Boolean(settings.signupsPaused)} onChange={(e) => update({ signupsPaused: e.target.checked })} className="h-5 w-5 accent-forest" />
            {t("signupsPausedLabel")}
          </label>
          <p className="mt-1 text-xs" data-signups-state={settings.signupsPaused ? "paused" : "open"}>{settings.signupsPaused ? t("signupsPausedOn") : t("signupsPausedOff")}</p>
        </fieldset>

        {field(t("settingHouseholdPrice"), settings.householdPriceEuro, (v) => update({ householdPriceEuro: v }), t("settingHouseholdPriceHint"))}

        {/* Business pricing: the admin picks ONE model; website text and sign-up screens follow it. */}
        <fieldset className="rounded-xl bg-mint/60 p-4 text-sm text-ink/80" data-business-pricing>
          <legend className="sr-only">{t("bpTitle")}</legend>
          <p className="font-extrabold text-ink" aria-hidden="true">{t("bpTitle")}</p>
          <p className="mt-1 text-xs">{t("bpIntro")}</p>
          <div className="mt-3 space-y-3">
            {BUSINESS_PRICING_MODELS.map((m) => (
              <div key={m} className="rounded-lg bg-white p-3">
                <label className="flex min-h-11 items-center gap-3 font-bold text-ink">
                  <input type="radio" name="business-pricing-model" value={m} checked={bp.model === m} onChange={() => setBp({ model: m })} className="h-5 w-5 accent-forest" />
                  {t(`bp_${m}`)}
                </label>
                {m === "per_location" && bp.model === m ? (
                  <p className="text-xs">
                    {t("bp_per_location_hint")} <Link href="/admin/pricing" className="font-bold text-forest underline">{t("goPricing")}</Link>
                  </p>
                ) : null}
                {m === "per_job_post" && bp.model === m ? (
                  <label className="mt-1 block text-xs font-semibold">
                    {t("bp_per_job_post_amount")}
                    <input type="text" inputMode="decimal" value={bp.jobPostEuro} onChange={(e) => setBp({ jobPostEuro: e.target.value })} placeholder="9,95" className={`mt-1 ${inputCls}`} />
                  </label>
                ) : null}
                {m === "tiers" && bp.model === m ? (
                  <div className="mt-1">
                    <p className="text-xs">{t("bp_tiers_hint")}</p>
                    <ul className="mt-2 space-y-2">
                      {bp.tiers.map((row, i) => (
                        <li key={i} className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-end gap-2" data-tier-row>
                          <label className="text-xs font-semibold">{t("bp_tier_name")}<input type="text" value={row.name} maxLength={40} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="Basic" className={`mt-1 ${inputCls}`} /></label>
                          <label className="text-xs font-semibold">{t("bp_tier_max")}<input type="text" inputMode="numeric" value={row.max} onChange={(e) => setTier(i, { max: e.target.value })} placeholder="3" className={`mt-1 ${inputCls}`} /></label>
                          <label className="text-xs font-semibold">{t("bp_tier_price")}<input type="text" inputMode="decimal" value={row.priceEuro} onChange={(e) => setTier(i, { priceEuro: e.target.value })} placeholder="49,00" className={`mt-1 ${inputCls}`} /></label>
                          <button type="button" onClick={() => setBp({ tiers: bp.tiers.filter((_, j) => j !== i) })} className="min-h-11 rounded-full px-3 text-xs font-bold text-red-700 underline">{t("bp_tier_remove")}</button>
                        </li>
                      ))}
                    </ul>
                    {bp.tiers.length < MAX_TIERS ? (
                      <button type="button" onClick={() => setBp({ tiers: [...bp.tiers, { name: "", max: "", priceEuro: "" }] })} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-forest px-4 text-xs font-bold text-forest">{t("bp_tier_add")}</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </fieldset>

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
