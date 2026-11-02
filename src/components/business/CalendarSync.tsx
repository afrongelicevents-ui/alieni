"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { BusinessBundle } from "@/lib/business-data";
import { needsReminder } from "@/lib/ical";
import { isSafeIcalUrl } from "@/lib/url-safety";
import { addManualTurnovers, saveIcalUrl } from "@/app/[locale]/business/actions";

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

export function CalendarSync({ bundle }: { bundle: BusinessBundle }) {
  const t = useTranslations("calendar");
  const lang = useLocale();
  const router = useRouter();
  const { profile, units, slots } = bundle;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, { date: string; count: string }>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isHotel = profile.business_type === "hotel";
  const isAirbnb = profile.business_type === "airbnb";
  if (!isHotel && !isAirbnb) return null;

  const now = new Date();
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function link(unitId: string) {
    const url = (urls[unitId] ?? "").trim();
    if (url && !isSafeIcalUrl(url)) {
      setNotice({ ...notice, [unitId]: t("icalUnsafe") });
      return;
    }
    setBusy(true);
    const r = await saveIcalUrl(unitId, url);
    setBusy(false);
    setNotice({ ...notice, [unitId]: r.ok ? t("linkedSaved") : t("saveFailed") });
    router.refresh();
  }

  async function addManual(unitId: string) {
    const m = manual[unitId];
    if (!m?.date) return;
    setBusy(true);
    const r = await addManualTurnovers(unitId, m.date, Number(m.count) || 1);
    setBusy(false);
    setNotice({ ...notice, [unitId]: r.ok ? t("manualAdded") : t("saveFailed") });
    router.refresh();
  }

  return (
    <section className="rounded-card-lg border border-line bg-white p-5">
      <h3 className="headline text-xl text-ink">{t("title")}</h3>
      <p className="mt-1 text-sm text-ink/70">{isHotel ? t("introHotel") : t("introAirbnb")}</p>

      <ul className="mt-4 space-y-5">
        {units.map((unit) => {
          const unitSlots = slots.filter((s) => s.unit_id === unit.id && s.status !== "cancelled");
          return (
            <li key={unit.id} className="rounded-xl border border-line p-4">
              <h4 className="font-extrabold text-ink">{unit.name || unit.address_line}</h4>

              <form onSubmit={(e) => { e.preventDefault(); link(unit.id); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={urls[unit.id] ?? unit.ical_url ?? ""}
                  onChange={(e) => setUrls({ ...urls, [unit.id]: e.target.value })}
                  placeholder={t("icalPlaceholder")}
                  className={inputCls}
                />
                <button type="submit" disabled={busy} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white hover:bg-forest-dark disabled:opacity-50">
                  {unit.ical_url ? t("relink") : t("link")}
                </button>
              </form>
              {notice[unit.id] ? <p className="mt-1 text-xs font-semibold text-forest">{notice[unit.id]}</p> : null}
              {unit.ical_url ? (
                <p className="mt-1 text-xs text-forest">✓ {t("linkedLive", { when: unit.ical_last_synced_at ? fmt(unit.ical_last_synced_at) : t("notYetSynced") })}{unit.ical_last_error ? ` · ${t("syncError")}` : ""}</p>
              ) : (
                <p className="mt-1 text-xs text-ink/70">{t("icalHint")}</p>
              )}

              {isHotel ? (
                <form onSubmit={(e) => { e.preventDefault(); addManual(unit.id); }} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-section p-3">
                  <label className="text-xs font-semibold text-ink/80">
                    {t("manualDate")}
                    <input type="date" value={manual[unit.id]?.date ?? ""} onChange={(e) => setManual({ ...manual, [unit.id]: { date: e.target.value, count: manual[unit.id]?.count ?? "1" } })} className={`mt-1 ${inputCls}`} />
                  </label>
                  <label className="text-xs font-semibold text-ink/80">
                    {t("manualCount")}
                    <input type="number" min={1} max={50} value={manual[unit.id]?.count ?? "1"} onChange={(e) => setManual({ ...manual, [unit.id]: { date: manual[unit.id]?.date ?? "", count: e.target.value } })} className={`mt-1 w-24 ${inputCls}`} />
                  </label>
                  <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-4 text-sm font-bold text-forest hover:bg-mint disabled:opacity-50">{t("manualAdd")}</button>
                </form>
              ) : null}

              {unitSlots.length > 0 ? (
                <ul className="mt-3 divide-y divide-line">
                  {unitSlots.map((s) => {
                    const urgent = needsReminder({ startsAt: s.starts_at, reservedBy: s.reserved_by, reminderSentAt: s.reminder_sent_at }, now);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="font-semibold text-ink">{fmt(s.starts_at)} → {fmt(s.ends_at)}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === "done" ? "bg-mint text-forest" : s.status === "reserved" ? "bg-forest text-white" : urgent ? "bg-red-100 text-red-800" : "bg-sun/30 text-ink"}`}>
                          {s.status === "open" && urgent ? t("statusUrgent") : t(`status_${s.status}` as "status_open")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-ink/70">{t("noSlots")}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-ink/70">{t("syncNote")}</p>
    </section>
  );
}
