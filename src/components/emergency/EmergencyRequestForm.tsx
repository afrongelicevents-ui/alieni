"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { formatEuro } from "@/lib/money";
import { dutchPostcodeSchema } from "@/lib/validation";
import { cancelCover, cancelEmergencyRequest, createEmergencyRequest, openCoverChat, reportAttendance } from "@/app/[locale]/emergency/actions";

/** Today's date as YYYY-MM-DD in the browser's local time zone (toISOString would give the UTC date). */
function localDateIso(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export type ActiveRequest = {
  id: string;
  status: "searching" | "accepted" | "expired" | "cancelled";
  windowStart: string;
  windowEnd: string;
  feeCents: number | null;
  cleanerName: string | null;
  cleanerRateCents: number | null;
};

export function EmergencyRequestForm({ active, requesterType }: { active: ActiveRequest | null; requesterType: "household" | "business" }) {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();

  const today = localDateIso();
  const [addressLine, setAddressLine] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("14:00");
  const [to, setTo] = useState("18:00");
  const [hours, setHours] = useState("3");
  const [tasks, setTasks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // While searching, refresh every 10s so acceptance shows up.
  useEffect(() => {
    if (active?.status !== "searching") return;
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [active?.status, router]);

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" });

  async function submit(e: React.FormEvent) {
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
    setBusy(true);
    const r = await createEmergencyRequest({
      addressLine: addressLine.trim(),
      postcode: pc.success ? pc.data : postcode,
      city: city.trim(),
      windowStart: new Date(`${today}T${from}:00`).toISOString(),
      windowEnd: new Date(`${today}T${to}:00`).toISOString(),
      hours: Number(hours),
      tasks: tasks.trim(),
    });
    setBusy(false);
    if (!r.ok) setErrors({ submit: t(`error_${r.error ?? "failed"}` as "error_failed"), detail: r.detail ?? "" });
    else router.refresh();
  }

  const [now] = useState(() => Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function chatWithCleaner() {
    if (!active) return;
    setBusy(true); setErrors({});
    const r = await openCoverChat(active.id);
    setBusy(false);
    if (!r.ok || !r.conversationId) return setErrors({ cancel: t(`error_${r.error ?? "failed"}` as "error_failed") });
    router.push(`/messages/${r.conversationId}`);
  }

  async function cancelAccepted() {
    if (!active) return;
    setBusy(true); setErrors({});
    const r = await cancelCover(active.id, "");
    setBusy(false);
    if (!r.ok) return setErrors({ cancel: t(`error_${r.error ?? "failed"}` as "error_failed") });
    setConfirmCancel(false); setDone(r.result === "cancelled_late" ? t("hhCancelledLate") : t("hhCancelled"));
    router.refresh();
  }

  async function attendance(came: boolean) {
    if (!active) return;
    setBusy(true); setErrors({});
    const r = await reportAttendance(active.id, came, "");
    setBusy(false);
    if (!r.ok) return setErrors({ cancel: t(`error_${r.error ?? "failed"}` as "error_failed") });
    setDone(came ? t("hhCame") : t("hhNoShow"));
    router.refresh();
  }

  async function cancelRequest() {
    if (!active) return;
    setBusy(true);
    setErrors({});
    const r = await cancelEmergencyRequest(active.id);
    setBusy(false);
    if (!r.ok) { setErrors({ cancel: t(`error_${r.error ?? "failed"}` as "error_failed") }); return; }
    router.refresh();
  }

  if (active && (active.status === "searching" || active.status === "accepted")) {
    const searching = active.status === "searching";
    return (
      <div className={`rounded-card-lg p-6 ${searching ? "border border-line bg-white" : "bg-mint"}`}>
        {searching ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-sun" aria-hidden="true" />
              <h2 className="text-lg font-extrabold text-ink">{t("searchingTitle")}</h2>
            </div>
            <p className="mt-2 text-sm text-ink/70">{t("searchingText", { until: timeOf(active.windowStart) })}</p>
            <p className="mt-2 text-xs text-ink/70">{t("honestNote")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={cancelRequest} className="inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-xs font-bold text-ink/70 disabled:opacity-50">{t("cancel")}</button>
            </div>
            {errors.cancel ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{errors.cancel}</p> : null}
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-ink">{t("acceptedTitle")}</h2>
            <p className="mt-2 text-sm text-ink/80">{t("acceptedText", { cleaner: active.cleanerName ?? "—", rate: formatEuro(active.cleanerRateCents ?? 0, lang) })}</p>
            <p className="mt-2 text-sm font-semibold text-forest">{t("feeCharged")}</p>
            <p className="mt-3 text-xs text-ink/70">{t("addressNote")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={chatWithCleaner} className="inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-bold text-white disabled:opacity-50">{t("hhMessage", { cleaner: active.cleanerName ?? "—" })}</button>
              {confirmCancel ? (
                <>
                  <span className="inline-flex items-center text-xs font-semibold text-ink/80">{t("hhCancelConfirm")}</span>
                  <button type="button" disabled={busy} onClick={cancelAccepted} className="inline-flex min-h-11 items-center rounded-full bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50">{t("hhCancelYes")}</button>
                  <button type="button" onClick={() => setConfirmCancel(false)} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/70">{t("hhKeep")}</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex min-h-11 items-center rounded-full border border-red-300 px-4 text-xs font-bold text-red-800">{t("hhCancel")}</button>
              )}
            </div>
            {new Date(active.windowStart).getTime() <= now ? (
              <div className="mt-4 rounded-xl bg-white p-3">
                <p className="text-sm font-bold text-ink">{t("attendanceQ", { cleaner: active.cleanerName ?? "—" })}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => attendance(true)} className="inline-flex min-h-11 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("attendanceYes")}</button>
                  <button type="button" disabled={busy} onClick={() => attendance(false)} className="inline-flex min-h-11 items-center rounded-full border border-red-300 px-4 text-xs font-bold text-red-800 disabled:opacity-50">{t("attendanceNo")}</button>
                </div>
              </div>
            ) : null}
            {done ? <p className="mt-3 text-sm font-semibold text-forest" role="status">{done}</p> : null}
            {errors.cancel ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{errors.cancel}</p> : null}
          </>
        )}
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[k]}</p> : null);

  return (
    <>
    {active && (active.status === "expired" || active.status === "cancelled") ? (
      <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm font-semibold text-ink/80" role="status" data-emergency-outcome={active.status}>{active.status === "expired" ? t("hhExpired") : t("hhCancelledEarlier")}</p>
    ) : null}
    {done && !active ? <p className="mb-4 rounded-xl bg-mint p-3 text-sm font-semibold text-forest" role="status">{done}</p> : null}
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
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label={t("from")} />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label={t("to")} />
          <select value={hours} onChange={(e) => setHours(e.target.value)} className={`${inputCls} col-span-2 sm:col-span-1`} aria-label={t("hours")}>
            {[1, 2, 3, 4, 5, 6, 8].map((h) => <option key={h} value={h}>{h} {t("hoursShort")}</option>)}
          </select>
        </div>
        {err("window")}
      </fieldset>
      <label className="text-sm font-semibold text-ink/80">{t("tasks")}
        <textarea rows={3} className={`mt-1 ${inputCls}`} value={tasks} onChange={(e) => setTasks(e.target.value)} maxLength={1000} placeholder={t("tasksPlaceholder")} />{err("tasks")}</label>
      <p className="rounded-xl bg-sun/25 p-3 text-xs text-ink/80">
        {t("feeNote")}
      </p>
      <p className="text-xs text-ink/70">{t("addressNote")}</p>
      {errors.submit ? <p className="text-sm font-semibold text-red-700">{errors.submit}{errors.detail ? <span className="mt-1 block break-words font-mono text-xs font-normal text-red-700/80" data-error-detail>{errors.detail}</span> : null}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{busy ? t("sending") : t("submit")}</button>
    </form>
    </>
  );
}
