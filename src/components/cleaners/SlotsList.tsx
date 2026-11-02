"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { SlotRow } from "@/lib/business-data";
import { needsReminder } from "@/lib/ical";
import { ButtonLink } from "@/components/ui/Button";
import { completeSlot, reserveSlot, type SlotActionState } from "@/app/[locale]/cleaners/slots/actions";

type Slot = SlotRow & { unitName: string; company: string };

/** Cleaner view: upcoming checkout cleans at connected businesses (brief v2 §6). */
export function SlotsList({ slots, myCleanerId }: { slots: Slot[]; myCleanerId: string | null }) {
  const t = useTranslations("calendar");
  const lang = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneState, doneAction, donePending] = useActionState(completeSlot, { ok: false } as SlotActionState);

  const now = new Date();
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="max-w-sm text-ink/70">{t("cleanerEmpty")}</p>
        <ButtonLink href="/jobs" variant="secondary">{t("cleanerBrowse")}</ButtonLink>
      </div>
    );
  }

  async function reserve(id: string) {
    setBusy(id);
    setError(null);
    const r = await reserveSlot(id);
    setBusy(null);
    if (!r.ok) setError(t(`error_${r.error ?? "failed"}` as "error_failed"));
    router.refresh();
  }

  return (
    <ul className="space-y-3">
      {error ? <li className="text-sm font-semibold text-red-700">{error}</li> : null}
      {slots.map((s) => {
        const urgent = needsReminder({ startsAt: s.starts_at, reservedBy: s.reserved_by, reminderSentAt: s.reminder_sent_at }, now);
        const mine = Boolean(myCleanerId) && s.reserved_by === myCleanerId;
        return (
          <li key={s.id} className="rounded-card-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-extrabold text-ink">{fmt(s.starts_at)}</p>
                <p className="text-sm text-ink/70">{s.company}{s.unitName ? ` · ${s.unitName}` : ""} · {t("until")} {fmt(s.ends_at)} · {s.source === "ical" ? t("sourceIcal") : t("sourceManual")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === "done" ? "bg-mint text-forest" : s.status === "reserved" ? "bg-forest text-white" : urgent ? "bg-red-100 text-red-800" : "bg-sun/30 text-ink"}`}>
                {s.status === "open" && urgent ? t("statusUrgent") : s.status === "reserved" && mine ? t("reservedByYou") : t(`status_${s.status}` as "status_open")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {s.status === "open" ? (
                <button type="button" disabled={busy === s.id} onClick={() => reserve(s.id)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{t("reserve")}</button>
              ) : null}
              {s.status === "reserved" && mine ? (
                <form action={doneAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="slotId" value={s.id} />
                  <label className="text-xs font-semibold text-ink/70">
                    {t("photoOptional")}
                    <input type="file" name="file" accept="image/*" className="mt-1 block text-xs" />
                  </label>
                  <button type="submit" disabled={donePending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white hover:bg-forest-dark disabled:opacity-50">{t("markDone")}</button>
                </form>
              ) : null}
              {s.status === "done" ? <p className="text-xs text-ink/70">✓ {t("doneAt")} {s.done_at ? fmt(s.done_at) : ""}{s.done_photo_path ? " · 📷" : ""}</p> : null}
            </div>
            {!doneState.ok && doneState.error ? <p className="mt-2 text-xs font-semibold text-red-700">{t(`error_${doneState.error}` as "error_failed")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
