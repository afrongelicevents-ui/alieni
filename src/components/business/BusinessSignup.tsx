"use client";

import { useState, useSyncExternalStore } from "react";
import { DEFAULT_BUSINESS_PRICING, quoteFor, startingQuote, type BusinessPricing } from "@/lib/business-pricing";
import { BusinessPrice } from "./BusinessPrice";
import { useLocale, useTranslations } from "next-intl";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, monthlyFee, type BusinessType } from "@/lib/business";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/money";
import { dutchPostcodeSchema, emailSchema } from "@/lib/validation";
import { saveBusinessProfile } from "@/app/[locale]/business/actions";
import { BusinessTypeCard } from "./BusinessTypeCard";

const DRAFT_KEY = "alieni-business-draft";
const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

type UnitDraft = { id: string; name: string; addressLine: string; postcode: string; city: string };
type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  btwNumber: string;
  businessType: BusinessType;
  unitCount: string;
  units: UnitDraft[];
};

/**
 * 4-step business sign-up. Signed-out visitors create their account in
 * step 1 (Supabase Auth); the profile and units are saved through a server
 * action at the end. Signed-in users skip the account fields.
 */
type SignupProps = { initialType?: BusinessType; signedIn: boolean; email?: string; unitPrices?: Partial<Record<BusinessType, number>>; businessPricing?: BusinessPricing };

const subscribeNothing = () => () => {};
const readSaved = () => { try { return window.localStorage.getItem(DRAFT_KEY); } catch { return null; } };

/** Reads the answers kept during the e-mail confirmation round trip (client only), then renders the form with them. */
export function BusinessSignup(props: SignupProps) {
  const saved = useSyncExternalStore(subscribeNothing, readSaved, () => null);
  let restored: Partial<Draft> | undefined;
  if (props.signedIn && saved) {
    try { restored = JSON.parse(saved) as Partial<Draft>; } catch { restored = undefined; }
  }
  return <BusinessSignupForm key={restored ? "restored" : "fresh"} {...props} restored={restored} />;
}

function BusinessSignupForm({ initialType, signedIn, email: knownEmail, unitPrices = {}, businessPricing = DEFAULT_BUSINESS_PRICING, restored }: SignupProps & { restored?: Partial<Draft> }) {
  const t = useTranslations("business");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    firstName: "", lastName: "", companyName: "", btwNumber: "",
    businessType: initialType ?? "airbnb", unitCount: "1",
    units: [{ id: "u1", name: "", addressLine: "", postcode: "", city: "" }],
    ...restored,
    email: knownEmail ?? restored?.email ?? "",
    password: "",
  });
  const set = (partial: Partial<Draft>) => setDraft((d) => ({ ...d, ...partial }));
  const [accountCreated, setAccountCreated] = useState(false); // the login exists: a retry must not sign up again
  const [notice, setNotice] = useState<string | null>(null);


  const unitCountNum = Math.max(1, Math.min(10000, Math.round(Number(draft.unitCount) || 0)));
  const unitPrice = unitPrices[draft.businessType] ?? null; // only with an active monthly rule (Admin → Pricing)
  const fee = unitPrice ? monthlyFee(draft.businessType, unitCountNum, { airbnb: 0, hotel: 0, restaurant: 0, office: 0, school: 0, [draft.businessType]: unitPrice }) : null;
  const cfg = BUSINESS_TYPES[draft.businessType];
  const unitWord = unitCountNum === 1 ? cfg.unit[lang] : cfg.unitPlural[lang];

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!draft.firstName.trim()) e.firstName = t("required");
      if (!draft.lastName.trim()) e.lastName = t("required");
      if (!signedIn) {
        if (!emailSchema.safeParse(draft.email).success) e.email = t("emailError");
        if (draft.password.length < 8) e.password = t("passwordError");
      }
      if (!draft.companyName.trim()) e.companyName = t("required");
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

  async function finish() {
    setBusy(true);
    setErrors({});
    try {
      if (!signedIn && !accountCreated) {
        const supabase = createClient();
        if (!supabase) {
          setErrors({ submit: t("error_not_configured") });
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: draft.email.trim().toLowerCase(),
          password: draft.password,
          options: { data: { role: "business", display_name: draft.companyName.trim() }, emailRedirectTo: `${window.location.origin}/${lang}/login?confirmed=1&next=${encodeURIComponent("/business/signup")}` },
        });
        if (error) {
          setErrors({ submit: /already/i.test(error.message) ? t("error_exists") : error.message });
          return;
        }
        if (!data.session) {
          // E-mail confirmation is on: keep the answers, finish after confirming and logging in.
          try {
            const { password: _pw, ...rest } = draft;
            void _pw;
            window.localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
          } catch {
            // storage unavailable: the person fills the steps in again
          }
          setNotice(t("confirmEmailFirst"));
          return;
        }
        setAccountCreated(true);
      }
      const result = await saveBusinessProfile({
        firstName: draft.firstName.trim(), lastName: draft.lastName.trim(),
        companyName: draft.companyName.trim(), btwNumber: draft.btwNumber.trim(),
        businessType: draft.businessType, unitCount: unitCountNum,
        units: draft.units.map((u) => ({ name: u.name.trim(), addressLine: u.addressLine.trim(), postcode: u.postcode, city: u.city.trim() })),
      });
      if (!result.ok) {
        setErrors({ submit: t(`error_${result.error ?? "failed"}` as "error_failed"), detail: result.detail ?? "" });
        return;
      }
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      // Full reload so the server sees the new session cookies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${lang}/business/dashboard`);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!validate()) return;
    if (step === 2) {
      // Hotels: rooms share one building, so one address. Others: one address per unit (max 10 here).
      const target = draft.businessType === "hotel" ? 1 : Math.min(unitCountNum, 10);
      const units = [...draft.units];
      while (units.length < target) units.push({ id: `u${units.length + 1}`, name: "", addressLine: "", postcode: "", city: "" });
      set({ units: units.slice(0, target), unitCount: String(unitCountNum) });
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    void finish();
  }

  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[k]}</p> : null);
  const stepTitles = [t("step1"), t("step2"), t("step3"), t("step4")];

  return (
    <div>
      <ol className="flex items-center gap-2">
        {stepTitles.map((title, i) => (
          <li key={title} className="flex flex-1 flex-col items-center gap-1">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${
              i < step ? "bg-forest text-white" : i === step ? "bg-sun text-white" : "bg-section text-ink/70"}`}>{i + 1}</span>
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
            {signedIn ? (
              <p className="rounded-xl bg-mint p-3 text-sm text-forest sm:col-span-2">{t("signedInAs", { email: knownEmail ?? "" })}</p>
            ) : (
              <>
                <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("workEmail")}
                  <input type="email" className={`mt-1 ${inputCls}`} value={draft.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />{err("email")}</label>
                <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("password")}
                  <input type="password" className={`mt-1 ${inputCls}`} value={draft.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" minLength={8} />{err("password")}</label>
              </>
            )}
            <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("companyName")}
              <input className={`mt-1 ${inputCls}`} value={draft.companyName} onChange={(e) => set({ companyName: e.target.value })} autoComplete="organization" />{err("companyName")}</label>
            <label className="text-sm font-semibold text-ink/80 sm:col-span-2">{t("btwOptional")}
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
                  <BusinessTypeCard type={type} quote={startingQuote(businessPricing, type, unitPrices)} selected={draft.businessType === type} compact />
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
              {businessPricing.model !== "per_location" ? (
                // the price follows the model chosen in Admin → Settings → Business pricing
                <div className="mt-1"><BusinessPrice quote={quoteFor(businessPricing, draft.businessType, unitCountNum, unitPrices)} unit={cfg.unit[lang]} variant="total" /></div>
              ) : unitPrice && fee ? (
                <>
                  <p className="mt-1 text-2xl font-extrabold text-forest">
                    {unitCountNum} {unitWord} × {formatEuro(unitPrice, lang)} = {formatEuro(fee.netCents, lang)}
                    <span className="text-base font-semibold text-ink/70">/{t("month")}</span>
                  </p>
                  <p className="text-sm text-ink/70">{t("plusBtw", { btw: formatEuro(fee.btwCents, lang), gross: formatEuro(fee.grossCents, lang) })}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-extrabold text-forest">{t("priceTba")}</p>
                  <p className="text-sm text-ink/70">{t("priceTbaNote")}</p>
                </>
              )}
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
            {draft.businessType !== "hotel" && unitCountNum > 10 ? <p className="text-xs text-ink/70">{t("moreUnitsLater", { count: unitCountNum - 10 })}</p> : null}
          </div>
        ) : null}
      </div>

      {notice ? <p className="mt-3 rounded-xl bg-mint p-3 text-sm font-semibold text-forest" role="status">{notice}</p> : null}
      {errors.submit ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{errors.submit}{errors.detail ? <span className="mt-1 block break-words font-mono text-xs font-normal text-red-700/80" data-error-detail>{errors.detail}</span> : null}</p> : null}

      <div className="mt-5 flex justify-between gap-3">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-6 text-sm font-bold text-ink/70 disabled:opacity-40">{t("back")}</button>
        <button type="button" onClick={next} disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-8 text-sm font-bold text-white hover:bg-sun-dark disabled:opacity-50">
          {busy ? t("saving") : step === 3 ? t("finish") : t("next")}</button>
      </div>
    </div>
  );
}
