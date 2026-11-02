"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SERVICE_LABELS } from "@/lib/sample-data";
import { saveHouseholdProfile } from "@/app/[locale]/home/actions";

const chip = (on: boolean) => `min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${on ? "border-forest bg-forest text-white" : "border-line bg-white text-ink/80 hover:bg-mint"}`;

/** Two questions, both optional: where, and what kind of help. No address. */
export function HouseholdOnboarding({ initial, compact, name: initialName }: { initial?: { postcodeArea: string; needs: string[]; homeType: string }; compact?: boolean; name?: string }) {
  const t = useTranslations("householdHome");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [area, setArea] = useState(initial?.postcodeArea ?? "");
  const [needs, setNeeds] = useState<string[]>(initial?.needs ?? []);
  const [homeType, setHomeType] = useState(initial?.homeType ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await saveHouseholdProfile({ name: name.trim(), postcodeArea: area.trim(), needs, homeType: homeType as "" | "apartment" | "house" | "other" });
    setBusy(false);
    if (!r.ok) setError(t("onboardingError"));
    else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className={`rounded-card-lg ${compact ? "border border-line bg-white" : "bg-mint"} p-5`}>
      {!compact ? (
        <>
          <h2 className="font-extrabold text-ink">{t("onboardingTitle")}</h2>
          <p className="mt-1 text-sm text-ink/70">{t("onboardingIntro")}</p>
        </>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80 sm:col-span-2">
          {t("nameLabel")}
          <input id="hh-name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none" />
          <span className="mt-1 block text-xs font-medium text-ink/60">{t("nameHint")}</span>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("areaLabel")}
          <input id="hh-area" type="text" inputMode="numeric" maxLength={4} value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, ""))} placeholder="1012" className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none" />
          <span className="mt-1 block text-xs font-medium text-ink/60">{t("areaHint")}</span>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("homeTypeLabel")}
          <select value={homeType} onChange={(e) => setHomeType(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none">
            <option value="">—</option>
            <option value="apartment">{t("home_apartment")}</option>
            <option value="house">{t("home_house")}</option>
            <option value="other">{t("home_other")}</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink/80">{t("needsLabel")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(SERVICE_LABELS).map(([key, labels]) => (
            <button key={key} type="button" aria-pressed={needs.includes(key)} onClick={() => setNeeds((n) => (n.includes(key) ? n.filter((x) => x !== key) : [...n, key]))} className={chip(needs.includes(key))}>{labels[lang]}</button>
          ))}
        </div>
      </fieldset>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark disabled:opacity-50">{busy ? t("saving") : t("save")}</button>
        {saved ? <span className="text-sm font-semibold text-forest">{t("savedNote")}</span> : null}
        {!compact ? <span className="text-xs text-ink/60">{t("skipNote")}</span> : null}
      </div>
    </form>
  );
}
