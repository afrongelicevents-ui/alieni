"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, monthlyFee, type BusinessType } from "@/lib/business";
import { useBusinessAccount, type BusinessUnit } from "@/lib/business-store";
import { formatEuro } from "@/lib/money";
import { dutchPostcodeSchema, emailSchema } from "@/lib/validation";
import { BusinessTypeCard } from "./BusinessTypeCard";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  kvkNumber: string;
  btwNumber: string;
  businessType: BusinessType;
  unitCount: string;
  units: BusinessUnit[];
};

export function BusinessSignup({ initialType }: { initialType?: BusinessType }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const { save } = useBusinessAccount();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>({
    firstName: "", lastName: "", email: "", password: "", companyName: "", kvkNumber: "", btwNumber: "",
    businessType: initialType ?? "airbnb", unitCount: "1",
    units: [{ id: "u1", name: "", addressLine: "", postcode: "", city: "" }],
  });
  const set = (partial: Partial<Draft>) => setDraft((d) => ({ ...d, ...partial }));

  const unitCountNum = Math.max(1, Math.min(10000, Math.round(Number(draft.unitCount) || 0)));
  const fee = monthlyFee(draft.businessType, unitCountNum);
  const cfg = BUSINESS_TYPES[draft.businessType];
  const unitWord = unitCountNum === 1 ? cfg.unit[lang] : cfg.unitPlural[lang];

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!draft.firstName.trim()) e.firstName = t("required");
      if (!draft.lastName.trim()) e.lastName = t("required");
      if (!emailSchema.safeParse(draft.email).success) e.email = t("emailError");
      if (draft.password.length < 8) e.password = t("passwordError");
      if (!draft.companyName.trim()) e.companyName = t("required");
      if (!/^\d{8}$/.test(draft.kvkNumber.trim())) e.kvkNumber = t("kvkError");
    }
    if (step === 2 && !(Number(draft.unitCount) >= 1)) e.unitCount = t("required");
    if (step === 3) {
      draft.units.forEach((u, i) => {
        if (!u.addressLine.trim()) e[`unit-${i}-address`] = t("required");
        if (!dutchPostcodeSchema.safeParse(u.postcode).success) e[`unit-${i}-postcode`] = t("postcodeError");
        if (!u.city.trim()) e[`unit-${i}-city`] = t("required");
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validate()) return;
    if (step === 2) {
      // Size the address list to the unit count (max 10 editable here; more via dashboard)
      const target = Math.min(unitCountNum, 10);
      const units = [...draft.units];
      while (units.length < target) units.push({ id: `u${units.length + 1}`, name: "", addressLine: "", postcode: "", city: "" });
      set({ units: units.slice(0, target), unitCount: String(unitCountNum) });
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    save({
      firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim().toLowerCase(),
      companyName: draft.companyName.trim(), kvkNumber: draft.kvkNumber.trim(), btwNumber: draft.btwNumber.trim(),
      businessType: draft.businessType, unitCount: unitCountNum,
      units: draft.units.map((u) => ({ ...u, postcode: dutchPostcodeSchema.parse(u.postcode), name: u.name.trim() || u.addressLine.trim() })),
      createdAt: new Date().toISOString(), billingStartedAt: null,
    });
    router.push("/business/dashboard");
  }

  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[k]}</p> : null);
  const stepTitles = [t("step1"), t("step2"), t("step3"), t("step4")];

  return (
    <div>
      <ol className="flex items-center gap-2">
        {stepTitles.map((title, i) => (
          <li key={title} className="flex flex-1 flex-col items-center gap-1">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${
              i < step ? "bg-forest text-white" : i === step ? "bg-sun text-ink" : "bg-section text-ink/70"}`}>{i + 1}</span>
            <span className={`text-center text-xs font-semibold ${i === step ? "text-ink" : "text-ink/70"}`}>{title}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-card-lg border border-line bg-white p-6">
        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink/80">{t("firstName")}
              <input className={`mt-1 ${inputCls}`} value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" />{err("firstName")}</label>
            <label className="text-sm font-semibold text-ink/80">{t("lastName")}
              <input className={`mt-1 ${inputCls}`} value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" />{err("lastName")}</label>
            <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("workEmail")}
              <input type="email" className={`mt-1 ${inputCls}`} value={draft.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />{err("email")}</label>
            <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("password")}
              <input type="password" className={`mt-1 ${inputCls}`} value={draft.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" minLength={8} />{err("password")}</label>
            <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("companyName")}
              <input className={`mt-1 ${inputCls}`} value={draft.companyName} onChange={(e) => set({ companyName: e.target.value })} autoComplete="organization" />{err("companyName")}</label>
            <label className="text-sm font-semibold text-ink/80">{t("kvk")}
              <input inputMode="numeric" className={`mt-1 ${inputCls}`} value={draft.kvkNumber} onChange={(e) => set({ kvkNumber: e.target.value })} placeholder="12345678" />
              <span className="mt-1 block text-xs font-medium text-ink/70">{t("kvkNote")}</span>{err("kvkNumber")}</label>
            <label className="text-sm font-semibold text-ink/80">{t("btwOptional")}
              <input className={`mt-1 ${inputCls}`} value={draft.btwNumber} onChange={(e) => set({ btwNumber: e.target.value })} placeholder="NL123456789B01" /></label>
          </div>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-ink/80">{t("pickType")}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {BUSINESS_TYPE_KEYS.map((type) => (
                <label key={type} className="cursor-pointer">
                  <input type="radio" name="business-type" value={type} checked={draft.businessType === type}
                    onChange={() => set({ businessType: type })} className="sr-only" />
                  <BusinessTypeCard type={type} selected={draft.businessType === type} compact />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div>
            <label className="text-sm font-semibold text-ink/80">{t("howMany", { units: cfg.unitPlural[lang] })}
              <input type="number" min={1} max={10000} inputMode="numeric" className={`mt-1 ${inputCls} text-2xl font-extrabold`}
                value={draft.unitCount} onChange={(e) => set({ unitCount: e.target.value })} />{err("unitCount")}</label>
            <div className="mt-4 rounded-card-lg bg-mint p-5">
              <p className="text-sm text-ink/70">{t("liveTotalLabel")}</p>
              <p className="mt-1 text-2xl font-extrabold text-forest">
                {unitCountNum} {unitWord} × {formatEuro(cfg.defaultUnitPriceCents, lang)} = {formatEuro(fee.netCents, lang)}
                <span className="text-base font-semibold text-ink/70">/{t("month")}</span>
              </p>
              <p className="text-sm text-ink/70">{t("plusBtw", { btw: formatEuro(fee.btwCents, lang), gross: formatEuro(fee.grossCents, lang) })}</p>
              <p className="mt-3 text-xs text-ink/70">{t("payLater")}</p>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-ink/70">{t("addressesIntro", { units: cfg.unitPlural[lang] })}</p>
            {draft.units.map((unit, i) => (
              <fieldset key={unit.id} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-extrabold text-ink">{cfg.unit[lang]} {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-ink/80 sm:col-span-2">{t("unitName")}
                    <input className={`mt-1 ${inputCls}`} value={unit.name} onChange={(e) => { const units = [...draft.units]; units[i] = { ...unit, name: e.target.value }; set({ units }); }} /></label>
                  <label className="text-xs font-semibold text-ink/80 sm:col-span-2">{t("addressLine")}
                    <input className={`mt-1 ${inputCls}`} value={unit.addressLine} onChange={(e) => { const units = [...draft.units]; units[i] = { ...unit, addressLine: e.target.value }; set({ units }); }} autoComplete="street-address" />{err(`unit-${i}-address`)}</label>
                  <label className="text-xs font-semibold text-ink/80">{t("postcode")}
                    <input className={`mt-1 ${inputCls}`} value={unit.postcode} onChange={(e) => { const units = [...draft.units]; units[i] = { ...unit, postcode: e.target.value }; set({ units }); }} placeholder="1012 AB" />{err(`unit-${i}-postcode`)}</label>
                  <label className="text-xs font-semibold text-ink/80">{t("city")}
                    <input className={`mt-1 ${inputCls}`} value={unit.city} onChange={(e) => { const units = [...draft.units]; units[i] = { ...unit, city: e.target.value }; set({ units }); }} />{err(`unit-${i}-city`)}</label>
                </div>
              </fieldset>
            ))}
            {unitCountNum > 10 ? <p className="text-xs text-ink/70">{t("moreUnitsLater", { count: unitCountNum - 10 })}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex justify-between gap-3">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-6 text-sm font-bold text-ink/70 disabled:opacity-40">{t("back")}</button>
        <button type="button" onClick={next}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-8 text-sm font-bold text-ink hover:bg-sun-dark">
          {step === 3 ? t("finish") : t("next")}</button>
      </div>
    </div>
  );
}
