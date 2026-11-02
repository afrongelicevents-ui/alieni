"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { cancelDeadline, canReportAttendance, isLateCancel, type CoverRules } from "@/lib/cover";
import type { CoverRequestRow } from "@/lib/cover-data";
import { formatEuro } from "@/lib/money";
import { cancelCover, createEmergencyRequest, openCoverChat, reportAttendance } from "@/app/[locale]/emergency/actions";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";
export type CoverUnit = { id: string; name: string; address_line: string; postcode: string; city: string };

/** Business side of emergency & replacement cover: request form + own requests with cancel / chat / attendance. */
export function BusinessCoverPanel({ units, requests, rules, ruleAmountCents, serverNow }: { units: CoverUnit[]; requests: CoverRequestRow[]; rules: CoverRules; ruleAmountCents: number | null; serverNow: string }) {
  const t = useTranslations("emergency");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const loc = lang === "en" ? "en-GB" : "nl-NL";
  const now = new Date(serverNow); // rendered on the server; keeps the component pure
  const todayIso = now.toISOString().slice(0, 10);
  const maxIso = new Date(now.getTime() + rules.maxDaysAhead * 864e5).toISOString().slice(0, 10);

  const [open, setOpen] = useState(requests.length === 0);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [addressLine, setAddressLine] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState(todayIso);
  const [from, setFrom] = useState("14:00");
  const [to, setTo] = useState("18:00");
  const [hours, setHours] = useState("3");
  const [tasks, setTasks] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [attNote, setAttNote] = useState("");

  const searching = requests.some((r) => r.status === "searching");
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000);
    return () => clearInterval(id);
  }, [searching, router]);

  const fmtDT = (iso: string) => new Date(iso).toLocaleString(loc, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!unitId && (!addressLine.trim() || !postcode.trim() || !city.trim())) err.unit = t("error_unit");
    if (date < todayIso || date > maxIso) err.date = t("dateError", { days: rules.maxDaysAhead });
    if (to <= from) err.window = t("windowError");
    if (tasks.trim().length < 5) err.tasks = t("tasksError");
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy("new");
    const r = await createEmergencyRequest({
      addressLine: unitId ? "" : addressLine.trim(), postcode: unitId ? "" : postcode.trim().toUpperCase(), city: unitId ? "" : city.trim(),
      windowStart: new Date(`${date}T${from}:00`).toISOString(), windowEnd: new Date(`${date}T${to}:00`).toISOString(),
      hours: Number(hours), tasks: tasks.trim(), unitId: unitId || null, reportTo: reportTo.trim(),
    });
    setBusy(null);
    if (!r.ok) setErrors({ submit: t(`error_${r.error ?? "failed"}` as "error_failed") });
    else { setOpen(false); setTasks(""); setReportTo(""); router.refresh(); }
  }
  async function doCancel(id: string) {
    setBusy(id);
    const r = await cancelCover(id, reason);
    setBusy(null); setCancelling(null); setReason("");
    setNotice(!r.ok ? t(`error_${r.error ?? "failed"}` as "error_failed") : r.result === "cancelled_late" ? t("cancelledLate") : t("cancelledFree"));
    router.refresh();
  }
  async function doAttendance(id: string, came: boolean) {
    setBusy(id);
    const r = await reportAttendance(id, came, attNote);
    setBusy(null); setAttNote("");
    if (!r.ok) setNotice(t(`error_${r.error ?? "failed"}` as "error_failed"));
    router.refresh();
  }
  async function chat(id: string) {
    setBusy(id);
    const r = await openCoverChat(id);
    setBusy(null);
    if (r.ok && r.conversationId) router.push(`/messages/${r.conversationId}`);
    else setNotice(t(`error_${r.error ?? "failed"}` as "error_failed"));
  }
  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs font-semibold text-red-700">{errors[k]}</p> : null);
  const tone = (s: string) => (s === "accepted" ? "bg-mint text-forest" : s === "searching" ? "bg-sun/30 text-ink" : "bg-section text-ink/60");

  return (
    <div className="space-y-6">
      {notice ? <p role="status" className="rounded-xl bg-mint p-3 text-sm font-semibold text-forest">{notice}</p> : null}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-ink hover:bg-sun-dark">{t("newRequest")}</button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-card-lg border border-line bg-white p-6" data-cover-form>
          <h2 className="text-lg font-extrabold text-ink">{t("newRequest")}</h2>
          <label className="text-sm font-semibold text-ink/80">{t("unit")}
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`mt-1 ${inputCls}`} data-cover-unit>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name || u.address_line} · {u.postcode} {u.city}</option>)}
              <option value="">{t("unitOther")}</option>
            </select>{err("unit")}</label>
          {!unitId ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={inputCls} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder={t("address")} autoComplete="street-address" />
              <input className={inputCls} value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="1012 AB" />
              <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("city")} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink/80">{t("date")}
              <input type="date" min={todayIso} max={maxIso} value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputCls}`} data-cover-date />{err("date")}</label>
            <fieldset>
              <legend className="text-sm font-semibold text-ink/80">{t("windowDay")}</legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label={t("from")} />
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label={t("to")} />
                <select value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} aria-label={t("hours")}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((h) => <option key={h} value={h}>{h} {t("hoursShort")}</option>)}
                </select>
              </div>{err("window")}
            </fieldset>
          </div>
          <label className="text-sm font-semibold text-ink/80">{t("tasks")}
            <textarea rows={3} className={`mt-1 ${inputCls}`} value={tasks} onChange={(e) => setTasks(e.target.value)} maxLength={1000} placeholder={t("tasksPlaceholder")} data-cover-tasks />{err("tasks")}</label>
          <label className="text-sm font-semibold text-ink/80">{t("reportTo")}
            <input className={`mt-1 ${inputCls}`} value={reportTo} onChange={(e) => setReportTo(e.target.value)} maxLength={200} placeholder={t("reportToPlaceholder")} data-cover-report-to /></label>
          <p className="rounded-xl bg-sun/25 p-3 text-xs text-ink/80">{ruleAmountCents ? t("feeNoteRule", { fee: formatEuro(ruleAmountCents, lang) }) : t("feeNoteNone")} {t("cancelWindowNote", { hours: rules.cancelWindowHours })}</p>
          <p className="text-xs text-ink/70">{t("addressNote")}</p>
          {errors.submit ? <p className="text-sm font-semibold text-red-700">{errors.submit}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy === "new"} className="inline-flex min-h-12 items-center justify-center rounded-full bg-sun px-8 font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{busy === "new" ? t("sending") : t("submit")}</button>
            {requests.length ? <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center rounded-full border border-line px-5 text-sm font-bold text-ink/70">{t("cancel").replace(/ .*/, "")}</button> : null}
          </div>
        </form>
      )}

      <section>
        <h2 className="headline text-xl text-ink">{t("myRequests")}</h2>
        {requests.length === 0 ? <p className="mt-2 text-sm text-ink/70">{t("noRequests")}</p> : (
          <ul className="mt-3 space-y-3">
            {requests.map((r) => {
              const start = new Date(r.window_start);
              const late = isLateCancel(start, now, rules);
              const askAttendance = canReportAttendance(r.status, r.attendance, start, now);
              return (
                <li key={r.id} className={`rounded-card-lg border p-4 ${r.status === "accepted" ? "border-forest/30 bg-mint/40" : "border-line bg-white"}`} data-cover-request={r.id} data-cover-status={r.status}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-extrabold text-ink">{fmtDT(r.window_start)} – {fmtT(r.window_end)} · {r.hours} {t("hoursShort")} · {r.city}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone(r.status)}`}>{t(`st_${r.status}`)}{r.attendance !== "unknown" ? ` · ${t(`attendance_${r.attendance}`)}` : ""}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/80">{r.tasks}{r.report_to ? ` · ${t("reportToShown", { reportTo: r.report_to })}` : ""}</p>
                  {r.status === "accepted" ? <p className="mt-1 text-sm font-semibold text-forest">{t("acceptedBy", { cleaner: r.cleanerName ?? "—", rate: formatEuro(r.cleanerRateCents ?? 0, lang) })}</p> : null}
                  {r.feeAmountCents !== null ? <p className="mt-1 text-xs text-ink/70">{formatEuro(r.feeAmountCents, lang)} · {r.feeStatus}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "accepted" ? <button type="button" disabled={busy === r.id} onClick={() => chat(r.id)} className="inline-flex min-h-10 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("message")}</button> : null}
                    {(r.status === "searching" || (r.status === "accepted" && now < start)) && cancelling !== r.id ? (
                      <button type="button" disabled={busy === r.id} onClick={() => setCancelling(r.id)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/80 disabled:opacity-50" data-cover-cancel>
                        {r.status === "accepted" && late ? t("cancelLate") : t("cancelFree", { time: fmtDT(cancelDeadline(start, rules).toISOString()) })}
                      </button>
                    ) : null}
                  </div>
                  {cancelling === r.id ? (
                    <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void doCancel(r.id); }}>
                      <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("cancelReason")} />
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy === r.id} className="inline-flex min-h-10 items-center rounded-full bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50" data-cover-cancel-confirm>{t("cancel")}</button>
                        <button type="button" onClick={() => setCancelling(null)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-xs font-bold text-ink/70">←</button>
                      </div>
                    </form>
                  ) : null}
                  {askAttendance ? (
                    <div className="mt-3 rounded-xl bg-white p-3" data-cover-attendance>
                      <p className="text-sm font-extrabold text-ink">{t("attendanceQ", { cleaner: r.cleanerName ?? "—" })}</p>
                      <input className={`mt-2 ${inputCls}`} value={attNote} onChange={(e) => setAttNote(e.target.value)} maxLength={500} placeholder={t("attendanceNote")} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={busy === r.id} onClick={() => doAttendance(r.id, true)} className="inline-flex min-h-10 items-center rounded-full bg-forest px-4 text-xs font-bold text-white disabled:opacity-50">{t("attendanceYes")}</button>
                        <button type="button" disabled={busy === r.id} onClick={() => doAttendance(r.id, false)} className="inline-flex min-h-10 items-center rounded-full border border-red-700 px-4 text-xs font-bold text-red-700 disabled:opacity-50">{t("attendanceNo")}</button>
                      </div>
                      <p className="mt-2 text-xs text-ink/60">{t("noShowNote", { limit: rules.strikeLimit })}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-xs text-ink/70"><Link href="/business/work" className="font-bold text-forest underline">{t("bizTitle")}</Link> → {t("myRequests")}</p>
    </div>
  );
}
