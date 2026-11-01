"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useEmergency } from "@/lib/emergency-store";
import { DEFAULT_EMERGENCY_FEES } from "@/lib/emergency";
import { formatEuro } from "@/lib/money";
import { dutchPostcodeSchema } from "@/lib/validation";
import { useBusinessAccount } from "@/lib/business-store";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function EmergencyRequestForm() {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const { requests, hydrated, create, accept, cancel } = useEmergency();
  const { account } = useBusinessAccount();
  const requesterType = account ? "business" : "household";

  const today = new Date().toISOString().slice(0, 10);
  const [addressLine, setAddressLine] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("14:00");
  const [to, setTo] = useState("18:00");
  const [hours, setHours] = useState("3");
  const [tasks, setTasks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!hydrated) return null;
  const active = requests.find((r) => r.status === "searching" || r.status === "accepted");
  const fee = requesterType === "household" ? DEFAULT_EMERGENCY_FEES.householdInclBtwCents : DEFAULT_EMERGENCY_FEES.businessExclBtwCents;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!addressLine.trim()) err.address = t("required");
    const pc = dutchPostcodeSchema.safeParse(postcode);
    if (!pc.success) err.postcode = t("postcodeError");
    if (!city.trim()) err.city = t("required");
    if (to <= from) err.window = t("windowError");
    if (tasks.trim().length < 5) err.tasks = t("tasksError");
    setErrors(err);
    if (Object.keys(err).length) return;
    create({
      requesterType,
      addressLine: addressLine.trim(),
      postcode: pc.success ? pc.data : postcode,
      city: city.trim(),
      windowStart: `${today}T${from}:00`,
      windowEnd: `${today}T${to}:00`,
      hours: Number(hours),
      tasks: tasks.trim(),
    });
  }

  if (active) {
    const searching = active.status === "searching";
    return (
      <div className={`rounded-card-lg p-6 ${searching ? "border border-line bg-white" : "bg-mint"}`}>
        {searching ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-sun" aria-hidden="true" />
              <h2 className="text-lg font-extrabold text-ink">{t("searchingTitle")}</h2>
            </div>
            <p className="mt-2 text-sm text-ink/70">{t("searchingText", { until: active.windowStart.slice(11, 16) })}</p>
            <p className="mt-2 text-xs text-ink/70">{t("honestNote")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => accept(active.id, "sample-2")} className="inline-flex min-h-11 items-center rounded-full border-2 border-dashed border-forest/50 px-4 text-xs font-bold text-forest hover:bg-mint">{t("simulateAccept")}</button>
              <button type="button" onClick={() => cancel(active.id)} className="inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-xs font-bold text-ink/70">{t("cancel")}</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-ink">{t("acceptedTitle")}</h2>
            <p className="mt-2 text-sm text-ink/80">{t("acceptedText", { cleaner: "Kofi A.", rate: formatEuro(2700, lang) })}</p>
            <p className="mt-2 text-sm font-semibold text-forest">{t("feeCharged", { fee: formatEuro(active.feeCents ?? fee, lang) })}</p>
            <p className="mt-3 text-xs text-ink/70">{t("addressNote")}</p>
          </>
        )}
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[k]}</p> : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-card-lg border border-line bg-white p-6">
      <label className="text-sm font-semibold text-ink/80">{t("address")}
        <input className={`mt-1 ${inputCls}`} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} autoComplete="street-address" />{err("address")}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink/80">{t("postcode")}
          <input className={`mt-1 ${inputCls}`} value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="1012 AB" />{err("postcode")}</label>
        <label className="text-sm font-semibold text-ink/80">{t("city")}
          <input className={`mt-1 ${inputCls}`} value={city} onChange={(e) => setCity(e.target.value)} />{err("city")}</label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-ink/80">{t("window")}</legend>
        <div className="mt-1 grid grid-cols-3 gap-3">
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label={t("from")} />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label={t("to")} />
          <select value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} aria-label={t("hours")}>
            {[1, 2, 3, 4, 5, 6, 8].map((h) => <option key={h} value={h}>{h} {t("hoursShort")}</option>)}
          </select>
        </div>
        {err("window")}
      </fieldset>
      <label className="text-sm font-semibold text-ink/80">{t("tasks")}
        <textarea rows={3} className={`mt-1 ${inputCls}`} value={tasks} onChange={(e) => setTasks(e.target.value)} maxLength={1000} placeholder={t("tasksPlaceholder")} />{err("tasks")}</label>
      <p className="rounded-xl bg-sun/25 p-3 text-xs text-ink/80">
        {t("feeNote", { fee: formatEuro(fee, lang), btw: requesterType === "household" ? t("inclBtw") : t("exclBtw") })}
      </p>
      <p className="text-xs text-ink/70">{t("addressNote")}</p>
      <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-ink hover:bg-sun-dark">{t("submit")}</button>
    </form>
  );
}
