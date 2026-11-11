"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { DEFAULT_RATE_FLOOR_CENTS, dutchPostcodeSchema } from "@/lib/validation";
import { saveCleanerAd, setAdStatus, uploadProfilePhoto, uploadVogFile, type AdActionState, type AdInput } from "@/app/[locale]/cleaners/new/actions";
import { BUSINESS_JOB_TYPES, JOB_TYPE_LABELS, LANGUAGE_LABELS, SERVICE_LABELS, type DayBlock, type JobType, type Weekday } from "@/lib/sample-data";
import { HOUSEHOLD_WORK_TYPES, COMMERCIAL_WORK_TYPES, type WorkType } from "@/lib/work-types";

/**
 * 3-step cleaner ad wizard (brief §5). The draft is kept on the device while
 * editing; "Publish" writes it to `cleaner_profiles` + `availability_slots`
 * through a server action (signed-in cleaners only).
 */

export type ExistingAd = {
  adId: string;
  status: string;
  photoUrl: string | null;
  vogStatus: string | null;
  draft: Partial<Draft>;
};

type Draft = {
  name: string;
  city: string;
  about: string;
  services: string[];
  languages: string[];
  jobTypes: JobType[];
  workScope: "household" | "commercial" | "both";
  workTypes: WorkType[];
  experienceYears: number | null;
  worksAs: "" | "independent" | "company";
  vogFileName: string;
  vogIssuedAt: string;
  emergencyOptIn: boolean;
  emergencyRateEuro: string;
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
  jobTypes: ["household"],
  workScope: "household",
  workTypes: ["household_regular"],
  experienceYears: null,
  worksAs: "",
  vogFileName: "",
  vogIssuedAt: "",
  emergencyOptIn: false,
  emergencyRateEuro: "",
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

export function AdWizard({ signedIn, existing, initialStep, startEditing }: { signedIn: boolean; existing: ExistingAd | null; initialStep?: number; startEditing?: boolean }) {
  const t = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";
  const router = useRouter();
  const [step, setStep] = useState(Math.min(2, Math.max(0, (initialStep ?? 1) - 1)));
  const [draft, setDraft] = useState<Draft>(existing ? { ...EMPTY, ...existing.draft } : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<AdActionState | null>(existing && !startEditing && !initialStep ? { ok: true, adId: existing.adId, status: existing.status } : null);
  const [busy, setBusy] = useState(false);
  const [photoState, photoAction, photoBusy] = useActionState(uploadProfilePhoto, { ok: false } as AdActionState);
  const [vogState, vogAction, vogBusy] = useActionState(uploadVogFile, { ok: false } as AdActionState);

  useEffect(() => {
    if (existing) return; // the database copy wins over a stale device draft
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      // One-time hydration from localStorage; cannot run during SSR render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDraft({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // ignore corrupt drafts
    }
  }, [existing]);

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

  const BUSINESS_ENVIRONMENTS: JobType[] = ["airbnb", "hotel", "restaurant", "office", "school"];
  function setScope(scope: Draft["workScope"]) {
    const keepEmergency = draft.jobTypes.includes("emergency") ? (["emergency"] as JobType[]) : [];
    const business = draft.jobTypes.filter((j) => BUSINESS_ENVIRONMENTS.includes(j));
    const next: JobType[] =
      scope === "household" ? ["household", ...keepEmergency]
      : scope === "commercial" ? [...business, ...keepEmergency]
      : ["household", ...business, ...keepEmergency];
    const wt = draft.workTypes.filter((w) => (scope === "household" ? HOUSEHOLD_WORK_TYPES.includes(w) : scope === "commercial" ? COMMERCIAL_WORK_TYPES.includes(w) : true));
    persist({ ...draft, workScope: scope, jobTypes: next, workTypes: wt.length ? wt : scope === "commercial" ? ["commercial_contract"] : ["household_regular"] });
  }
  function toggleWorkType(w: WorkType) {
    const next = toggleIn(draft.workTypes, w);
    // the emergency opt-in and the 'emergency cover' work type are one and the same choice
    const jobTypes = w === "emergency_cover" ? (next.includes(w) ? (draft.jobTypes.includes("emergency") ? draft.jobTypes : [...draft.jobTypes, "emergency" as JobType]) : draft.jobTypes.filter((j) => j !== "emergency")) : draft.jobTypes;
    persist({ ...draft, workTypes: next, jobTypes });
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
      if (draft.workScope !== "household" && !draft.jobTypes.some((j) => BUSINESS_ENVIRONMENTS.includes(j))) e.jobTypes = t("environmentsError");
      if (draft.workTypes.length === 0) e.workTypes = t("workTypesError");
      if (draft.jobTypes.includes("school") && !draft.vogIssuedAt) e.vog = t("vogError");
      if (draft.jobTypes.includes("emergency")) {
        const em = parseRateCents(draft.emergencyRateEuro);
        if (em === null || cents === null || em < Math.ceil(cents * 1.5)) e.emergency = t("emergencyRateError");
      }
    }
    if (s === 2) {
      if (!dutchPostcodeSchema.safeParse(draft.postcode).success) e.postcode = t("postcodeError");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function toInput(publish: boolean): AdInput {
    const availability: { weekday: number; block: DayBlock }[] = [];
    for (const [day, blocks] of Object.entries(draft.availability)) {
      for (const block of blocks ?? []) availability.push({ weekday: Number(day), block });
    }
    return {
      name: draft.name,
      city: draft.city,
      about: draft.about,
      services: draft.services,
      languages: draft.languages,
      jobTypes: draft.jobTypes,
      workScope: draft.workScope,
      workTypes: draft.workTypes,
      experienceYears: draft.experienceYears,
      worksAs: draft.worksAs || null,
      emergencyRateCents: parseRateCents(draft.emergencyRateEuro) ?? 0,
      rateCents: parseRateCents(draft.rateEuro) ?? 0,
      minHours: draft.minHours,
      postcode: draft.postcode,
      radiusKm: draft.radiusKm,
      availability,
      vogIssuedAt: draft.vogIssuedAt,
      publish,
    };
  }

  async function next() {
    if (!validateStep(step)) return;
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (!signedIn) {
      // Draft stays on the device; come back here after creating the account.
      router.push("/signup?role=cleaner&next=/cleaners/new");
      return;
    }
    setBusy(true);
    const result = await saveCleanerAd(toInput(true));
    setBusy(false);
    if (result.ok) {
      setSaved(result);
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.refresh();
    } else {
      setErrors({ submit: t(`error_${result.error ?? "failed"}` as "error_failed"), detail: result.detail ?? "" });
    }
  }

  async function toggleOnline() {
    if (!saved) return;
    setBusy(true);
    const result = await setAdStatus(saved.status === "published" ? "hidden" : "published");
    setBusy(false);
    if (result.ok) setSaved({ ...saved, status: result.status });
    router.refresh();
  }

  if (saved) {
    const online = saved.status === "published";
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-card-lg bg-mint p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="headline text-2xl text-ink">{online ? t("liveTitle") : t("offlineTitle")}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${online ? "bg-forest text-white" : "bg-sun/40 text-ink"}`}>{online ? t("statusOnline") : t("statusOffline")}</span>
          </div>
          <p className="mt-2 max-w-md text-ink/70">{online ? t("liveText") : t("offlineText")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {saved.adId ? (
              <Link href={`/cleaners/${saved.adId}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-bold text-white hover:bg-forest-dark">{t("viewAd")}</Link>
            ) : null}
            <button type="button" onClick={() => setSaved(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-6 text-sm font-bold text-forest hover:bg-white">{t("editAgain")}</button>
            <button type="button" onClick={toggleOnline} disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line bg-white px-6 text-sm font-bold text-ink/80 hover:bg-section disabled:opacity-50">{online ? t("takeOffline") : t("putOnline")}</button>
          </div>
        </div>

        <form action={photoAction} className="rounded-card-lg border border-line bg-white p-5">
          <h3 className="font-extrabold text-ink">{t("photoTitle")}</h3>
          <p className="mt-1 text-sm text-ink/70">{t("photoHint")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
              {existing?.photoUrl && !photoState.ok ? (
                // eslint-disable-next-line @next/next/no-img-element -- storage URL, already sized
                <img src={existing.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : photoState.ok ? (
                <span className="text-xs font-bold text-forest">✓</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
              )}
            </span>
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-section file:px-4 file:py-2 file:text-sm file:font-bold file:text-forest" />
            <button type="submit" disabled={photoBusy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white disabled:opacity-50">{photoBusy ? t("uploading") : t("uploadPhoto")}</button>
          </div>
          {photoState.ok ? <p className="mt-2 text-sm font-semibold text-forest">{t("photoSaved")}</p> : null}
          {!photoState.ok && photoState.error ? <p className="mt-2 text-sm font-semibold text-red-700">{t(`error_${photoState.error}` as "error_failed")}</p> : null}
        </form>

        {draft.jobTypes.includes("school") ? (
          <form action={vogAction} className="rounded-card-lg border border-forest/30 bg-mint p-5">
            <h3 className="font-extrabold text-ink">{t("vogLabel")}</h3>
            <p className="mt-1 text-xs text-ink/70">{t("vogPrivacy")}</p>
            {existing?.vogStatus ? <p className="mt-2 text-sm font-semibold text-forest">{t(`vogStatus_${existing.vogStatus}` as "vogStatus_pending")}</p> : null}
            <input type="hidden" name="issuedAt" value={draft.vogIssuedAt} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-bold file:text-forest" />
              <button type="submit" disabled={vogBusy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white disabled:opacity-50">{vogBusy ? t("uploading") : t("uploadVog")}</button>
            </div>
            {vogState.ok ? <p className="mt-2 text-sm font-semibold text-forest">{t("vogUploaded")}</p> : null}
            {!vogState.ok && vogState.error ? <p className="mt-2 text-sm font-semibold text-red-700">{t(`error_${vogState.error}` as "error_failed")}</p> : null}
          </form>
        ) : null}
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
                i < step ? "bg-forest text-white" : i === step ? "bg-sun text-white" : "bg-section text-ink/70"
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
              {t("experienceLabel")}
              <select value={draft.experienceYears ?? ""} onChange={(e) => persist({ ...draft, experienceYears: e.target.value === "" ? null : Number(e.target.value) })} className={`mt-1 ${inputCls}`}>
                <option value="">{t("experiencePick")}</option>
                {[0, 1, 2, 3, 5, 10, 15, 20].map((y) => (
                  <option key={y} value={y}>{y === 0 ? t("experienceNone") : t("experienceYears", { years: y })}</option>
                ))}
              </select>
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

            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("scopeLabel")}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(["household", "commercial", "both"] as const).map((scope) => (
                  <label key={scope} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-3 text-center text-sm font-bold ${draft.workScope === scope ? "border-forest bg-mint text-forest" : "border-line bg-white text-ink/70"}`}>
                    <input type="radio" name="work-scope" value={scope} checked={draft.workScope === scope} onChange={() => setScope(scope)} className="sr-only" />
                    {t(`scope_${scope}` as "scope_household")}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("workTypesLabel")} <span className="block text-xs font-medium text-ink/60">{t("workTypesHint")}</span></legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...(draft.workScope !== "commercial" ? HOUSEHOLD_WORK_TYPES : []), ...(draft.workScope !== "household" ? COMMERCIAL_WORK_TYPES : [])].map((w) => (
                  <button key={w} type="button" aria-pressed={draft.workTypes.includes(w)} onClick={() => toggleWorkType(w)} className={chipCls(draft.workTypes.includes(w))} data-work-type={w}>
                    {t(`wt_${w}` as "wt_household_regular")}
                  </button>
                ))}
              </div>
              {errors.workTypes ? <p className="mt-2 text-xs font-semibold text-red-700">{errors.workTypes}</p> : null}
            </fieldset>

            {draft.workScope !== "household" ? (
              <fieldset>
                <legend className="text-sm font-semibold text-ink/80">{t("environmentsLabel")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUSINESS_ENVIRONMENTS.map((key) => (
                    <button key={key} type="button" aria-pressed={draft.jobTypes.includes(key)} onClick={() => persist({ ...draft, jobTypes: toggleIn(draft.jobTypes, key) })} className={chipCls(draft.jobTypes.includes(key))}>
                      {JOB_TYPE_LABELS[key][locale]}
                    </button>
                  ))}
                </div>
                {errors.jobTypes ? <p className="mt-2 text-xs font-semibold text-red-700">{errors.jobTypes}</p> : null}
              </fieldset>
            ) : null}

            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 text-sm font-semibold text-ink has-[:checked]:border-forest has-[:checked]:bg-mint">
              <input type="checkbox" checked={draft.jobTypes.includes("emergency")} onChange={() => toggleWorkType("emergency_cover")} className="h-5 w-5 accent-forest" />
              <span>{JOB_TYPE_LABELS.emergency[locale]} <span className="block text-xs font-medium text-ink/60">{t("emergencyHint")}</span></span>
            </label>

            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("worksAsLabel")} <span className="block text-xs font-medium text-ink/60">{t("worksAsHint")}</span></legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["independent", "company"] as const).map((w) => (
                  <label key={w} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-3 text-center text-sm font-bold ${draft.worksAs === w ? "border-forest bg-mint text-forest" : "border-line bg-white text-ink/70"}`}>
                    <input type="radio" name="works-as" value={w} checked={draft.worksAs === w} onChange={() => persist({ ...draft, worksAs: draft.worksAs === w ? "" : w })} className="sr-only" />
                    {t(`worksAs_${w}` as "worksAs_independent")}
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.jobTypes.includes("school") ? (
              <fieldset className="rounded-xl border border-forest/30 bg-mint p-4">
                <legend className="px-1 text-sm font-extrabold text-ink">{t("vogLabel")}</legend>
                <p className="text-xs text-ink/70">{t("vogIntro")}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <p className="text-xs font-semibold text-ink/80">{t("vogAfterPublish")}</p>
                  <label className="text-xs font-semibold text-ink/80">
                    {t("vogIssuedAt")}
                    <input type="date" value={draft.vogIssuedAt} onChange={(e) => persist({ ...draft, vogIssuedAt: e.target.value })} className={`mt-1 ${inputCls}`} />
                  </label>
                </div>
                <p className="mt-2 text-xs text-ink/70">{t("vogPrivacy")}</p>
                {errors.vog ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.vog}</p> : null}
              </fieldset>
            ) : null}

            {draft.jobTypes.includes("emergency") ? (
              <label className="text-sm font-semibold text-ink/80">
                {t("emergencyRateLabel")}
                <input type="text" inputMode="decimal" value={draft.emergencyRateEuro} onChange={(e) => persist({ ...draft, emergencyRateEuro: e.target.value, emergencyOptIn: true })} className={`mt-1 ${inputCls}`} />
                <p className="mt-1 text-xs font-medium text-ink/70">{t("emergencyRateHint")}</p>
                {errors.emergency ? <p className="mt-1 text-xs font-semibold text-red-700">{errors.emergency}</p> : null}
              </label>
            ) : null}

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
                <p className="mt-1 text-xs font-medium text-ink/70">{draft.jobTypes.some((j) => BUSINESS_JOB_TYPES.includes(j)) ? t("rateHintBusiness") : t("rateHint")}</p>
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
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-sun px-8 text-sm font-bold text-white hover:bg-sun-dark disabled:opacity-50"
        >
          {busy ? t("publishing") : step === 2 ? (signedIn ? t("publish") : t("publishSignup")) : t("next")}
        </button>
      </div>
      {errors.submit ? <p className="mt-3 text-sm font-semibold text-red-700">{errors.submit}{errors.detail ? <span className="mt-1 block break-words font-mono text-xs font-normal text-red-700/80" data-error-detail>{errors.detail}</span> : null}</p> : null}
      {!signedIn && step === 2 ? <p className="mt-3 rounded-xl bg-sun/25 p-3 text-sm text-ink/80">{t("signupNote")}</p> : null}
    </div>
  );
}
