"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSlots } from "@/lib/slots-store";
import { needsReminder } from "@/lib/ical";
import { ButtonLink } from "@/components/ui/Button";

/** Cleaner view: upcoming checkout cleans at connected businesses (brief v2 §6). */
export function SlotsList() {
  const t = useTranslations("calendar");
  const lang = useLocale();
  const { slots, hydrated, reserve, markDone } = useSlots();
  const [photo, setPhoto] = useState<Record<string, string>>({});
  if (!hydrated) return null;

  const upcoming = [...slots].filter((s) => s.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const now = new Date();
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="max-w-sm text-ink/70">{t("cleanerEmpty")}</p>
        <ButtonLink href="/jobs" variant="secondary">{t("cleanerBrowse")}</ButtonLink>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {upcoming.map((s) => {
        const urgent = needsReminder({ startsAt: s.startsAt, reservedBy: s.reservedBy, reminderSentAt: null }, now);
        return (
          <li key={s.id} className="rounded-card-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-extrabold text-ink">{fmt(s.startsAt)}</p>
                <p className="text-sm text-ink/70">{t("until")} {fmt(s.endsAt)} · {s.source === "ical" ? t("sourceIcal") : t("sourceManual")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === "done" ? "bg-mint text-forest" : s.status === "reserved" ? "bg-forest text-white" : urgent ? "bg-red-100 text-red-800" : "bg-sun/30 text-ink"}`}>
                {s.status === "open" && urgent ? t("statusUrgent") : t(`status_${s.status}` as "status_open")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {s.status === "open" ? (
                <button type="button" onClick={() => reserve(s.id)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark">{t("reserve")}</button>
              ) : null}
              {s.status === "reserved" && s.reservedBy === "me" ? (
                <>
                  <label className="text-xs font-semibold text-ink/70">
                    {t("photoOptional")}
                    <input type="file" accept="image/*" onChange={(e) => setPhoto({ ...photo, [s.id]: e.target.files?.[0]?.name ?? "" })} className="mt-1 block text-xs" />
                  </label>
                  <button type="button" onClick={() => markDone(s.id, photo[s.id] || null)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white hover:bg-forest-dark">{t("markDone")}</button>
                </>
              ) : null}
              {s.status === "done" ? <p className="text-xs text-ink/70">✓ {t("doneAt")} {s.doneAt ? fmt(s.doneAt) : ""}{s.donePhotoName ? ` · 📷 ${s.donePhotoName}` : ""}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
