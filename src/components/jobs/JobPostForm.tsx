"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FREQUENCY_LABELS, SPACE_TYPE_LABELS, WEEKDAYS, isRecurring, type Frequency, type SpaceType } from "@/lib/jobs";
import { dutchPostcodeSchema, DEFAULT_RATE_FLOOR_CENTS } from "@/lib/validation";
import { createJob } from "@/app/[locale]/jobs/actions";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export type JobFormUnit = { id: string; name: string; postcode: string; city: string };

/** Post a job (free). Requires a business account; the page guards that. */
export function JobPostForm({ units, initialFrequency = "weekly" }: { units: JobFormUnit[]; initialFrequency?: Frequency }) {
  const t = useTranslations("jobs");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const [unitId, setUnitId] = useState("");
  const [spaceType, setSpaceType] = useState<SpaceType>("office");
  const [sizeM2, setSizeM2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [scheduleNote, setScheduleNote] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("18,00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visitStart, setVisitStart] = useState("09:00");
  const [visitHours, setVisitHours] = useState("2");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const unit = units.find((u) => u.id === unitId);
    const postcodeParsed = dutchPostcodeSchema.safeParse(unit ? unit.postcode : postcode);
    if (!postcodeParsed.success) next.postcode = t("postcodeError");
    if (description.trim().length < 10) next.description = t("descriptionError");
    const budgetCents = Math.round(Number(budget.replace(",", ".")) * 100);
    if (!Number.isFinite(budgetCents) || budgetCents < DEFAULT_RATE_FLOOR_CENTS) next.budget = t("rateError");
    const scheduled = true; // every job has a schedule now (the per-checkout turnover option was removed)
    const hours = Number(visitHours.replace(",", "."));
    const today = new Date().toISOString().slice(0, 10);
    if (scheduled && (!startDate || startDate < today)) next.startDate = t("startDateError");
    if (scheduled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(visitStart)) next.visitStart = t("visitStartError");
    if (scheduled && (!Number.isFinite(hours) || hours < 0.5 || hours > 24)) next.visitHours = t("visitHoursError");
    if ((frequency === "weekly" || frequency === "biweekly") && weekdays.length === 0) next.weekdays = t("weekdaysError");
    if (endDate && (!isRecurring(frequency) || endDate < startDate)) next.endDate = t("endDateError");
    setErrors(next);
    if (Object.keys(next).length > 0 || !postcodeParsed.success) return;

    setBusy(true);
    const result = await createJob({
      spaceType,
      sizeM2: sizeM2 ? Math.max(1, Math.round(Number(sizeM2))) : null,
      unitId: unit ? unit.id : null,
      postcode: postcodeParsed.data,
      city: unit ? unit.city : city.trim(),
      frequency,
      scheduleNote: scheduleNote.trim(),
      description: description.trim(),
      budgetCents,
      startDate: scheduled && startDate ? startDate : null,
      endDate: isRecurring(frequency) && endDate ? endDate : null,
      weekdays: frequency === "weekly" || frequency === "biweekly" || frequency === "daily" ? weekdays : [],
      visitStart: scheduled ? visitStart : null,
      visitHours: scheduled ? hours : null,
    });
    setBusy(false);
    if (result.ok) setSaved(true);
    else setErrors({ submit: t(`error_${result.error ?? "failed"}` as "error_failed") });
  }

  if (saved) {
    return (
      <div className="rounded-card-lg bg-mint p-8 text-center">
        <h2 className="headline text-2xl text-ink">{t("savedTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink/70">{t("savedLiveText")}</p>
        <Link href="/jobs" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-6 text-sm font-bold text-forest hover:bg-white">
          {t("viewBoard")}
        </Link>
      </div>
    );
  }

  const err = (key: string) => (errors[key] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[key]}</p> : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-card-lg border border-line bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">
          {t("spaceTypeLabel")}
          <select value={spaceType} onChange={(e) => setSpaceType(e.target.value as SpaceType)} className={`mt-1 ${inputCls}`}>
            {Object.entries(SPACE_TYPE_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>{labels[lang]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("sizeLabel")}
          <input type="number" min={1} value={sizeM2} onChange={(e) => setSizeM2(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
      </div>

      {units.length > 0 ? (
        <label className="text-sm font-semibold text-ink/80">
          {t("unitLabel")}
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="">{t("unitAny")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} — {u.city}</option>
            ))}
          </select>
        </label>
      ) : null}

      {!unitId ? (
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
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">
          {t("frequencyLabel")}
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={`mt-1 ${inputCls}`}>
            {Object.entries(FREQUENCY_LABELS).map(([key, labels]) => (
              <option key={key} value={key}>{labels[lang]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink/80">
          {t("budgetLabel")}
          <input type="text" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={`mt-1 ${inputCls}`} />
          {err("budget")}
        </label>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-xl bg-section p-4">
        <legend className="px-1 text-sm font-extrabold text-ink">{t("scheduleTitle")}</legend>
        {frequency === "weekly" || frequency === "biweekly" || frequency === "daily" ? (
          <div>
            <p className="text-sm font-semibold text-ink/80">{frequency === "daily" ? t("weekdaysLabelDaily") : t("weekdaysLabel")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d.n);
                return (
                  <button key={d.n} type="button" aria-pressed={on} onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d.n) : [...weekdays, d.n])} className={`min-h-11 min-w-11 rounded-full border px-3 text-sm font-bold ${on ? "border-forest bg-forest text-white" : "border-line bg-white text-forest"}`}>{d[lang]}</button>
                );
              })}
            </div>
            {err("weekdays")}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-ink/80">
            {isRecurring(frequency) ? t("startDateLabel") : t("dateLabel")}
            <input type="date" value={startDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} className={`mt-1 ${inputCls}`} />
            {err("startDate")}
          </label>
          <label className="text-sm font-semibold text-ink/80">
            {t("visitStartLabel")}
            <input type="time" value={visitStart} onChange={(e) => setVisitStart(e.target.value)} className={`mt-1 ${inputCls}`} />
            {err("visitStart")}
          </label>
          <label className="text-sm font-semibold text-ink/80">
            {t("visitHoursLabel")}
            <input type="text" inputMode="decimal" value={visitHours} onChange={(e) => setVisitHours(e.target.value)} className={`mt-1 ${inputCls}`} />
            {err("visitHours")}
          </label>
        </div>
        {isRecurring(frequency) ? (
          <label className="text-sm font-semibold text-ink/80 sm:max-w-xs">
            {t("endDateLabel")}
            <input type="date" value={endDate} min={startDate || new Date().toISOString().slice(0, 10)} onChange={(e) => setEndDate(e.target.value)} className={`mt-1 ${inputCls}`} />
            {err("endDate")}
          </label>
        ) : null}
      </fieldset>

      <label className="text-sm font-semibold text-ink/80">
        {t("scheduleLabel")}
        <input type="text" value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} placeholder={t("schedulePlaceholder")} maxLength={300} className={`mt-1 ${inputCls}`} />
      </label>

      <label className="text-sm font-semibold text-ink/80">
        {t("descriptionLabel")}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} className={`mt-1 ${inputCls}`} />
        {err("description")}
      </label>

      <p className="rounded-xl bg-mint p-3 text-xs text-ink/80">{t("payNote")}</p>
      {errors.submit ? <p className="text-sm font-semibold text-red-700">{errors.submit}</p> : null}

      <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-white hover:bg-sun-dark disabled:opacity-50">
        {busy ? t("posting") : t("submit")}
      </button>
    </form>
  );
}
