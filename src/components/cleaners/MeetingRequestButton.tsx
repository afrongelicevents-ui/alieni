"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useConversations, type DayBlockKey, type MeetingType } from "@/lib/chat-store";
import type { SampleCleaner, Weekday } from "@/lib/sample-data";

/**
 * Meeting request flow (brief §3.4): choose in-person or video plus a slot
 * from the cleaner's availability. The Mollie €0 mandate step plugs in here
 * in the payments phase.
 */
export function MeetingRequestButton({ cleaner }: { cleaner: SampleCleaner }) {
  const t = useTranslations("meeting");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { requestMeeting } = useConversations();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MeetingType>("in_person");
  const [slot, setSlot] = useState<string>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const slots: { weekday: Weekday; block: DayBlockKey }[] = [];
  for (const [dayStr, blocks] of Object.entries(cleaner.availability)) {
    for (const block of blocks ?? []) {
      slots.push({ weekday: Number(dayStr) as Weekday, block });
    }
  }
  slots.sort((a, b) => a.weekday - b.weekday);

  function submit() {
    if (!slot) {
      setError(true);
      return;
    }
    const [weekday, block] = slot.split(":");
    const conversationId = requestMeeting(
      cleaner.id,
      type,
      Number(weekday),
      block as DayBlockKey,
      message,
    );
    router.push(`/messages/${conversationId}`);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-sun px-6 py-3 font-bold text-ink transition-colors hover:bg-sun-dark"
        >
          {t("cta")}
        </button>
        <p className="text-center text-xs text-ink/70">{t("freeNote")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-card-lg border border-line bg-section p-5">
      <h3 className="text-lg font-extrabold text-ink">{t("title", { name: cleaner.name })}</h3>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink/80">{t("typeLabel")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["in_person", "video"] as const).map((option) => (
            <label
              key={option}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-4 text-sm font-bold ${
                type === option ? "border-forest bg-white text-forest" : "border-line bg-white text-ink/70"
              }`}
            >
              <input
                type="radio"
                name="meeting-type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                className="sr-only"
              />
              {option === "in_person" ? t("inPerson") : t("video")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink/80">{t("slotLabel")}</legend>
        {slots.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">{t("noSlots")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map(({ weekday, block }) => {
              const value = `${weekday}:${block}`;
              const active = slot === value;
              return (
                <label
                  key={value}
                  className={`min-h-11 cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold ${
                    active ? "border-forest bg-forest text-white" : "border-line bg-white text-ink/80 hover:bg-mint"
                  }`}
                >
                  <input
                    type="radio"
                    name="meeting-slot"
                    value={value}
                    checked={active}
                    onChange={() => {
                      setSlot(value);
                      setError(false);
                    }}
                    className="sr-only"
                  />
                  {tCommon(`day${weekday}` as "day0")} · {tCommon(block)}
                </label>
              );
            })}
          </div>
        )}
        {error ? <p className="mt-2 text-xs font-semibold text-red-700">{t("slotError")}</p> : null}
      </fieldset>

      <label className="mt-4 block text-sm font-semibold text-ink/80">
        {t("messageLabel")}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          maxLength={500}
          rows={2}
          className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white p-3 text-sm focus:outline-none"
        />
      </label>

      <p className="mt-3 rounded-xl bg-sun/25 p-3 text-xs text-ink/70">{t("mandateNote")}</p>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={submit}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-sun px-6 text-sm font-bold text-ink hover:bg-sun-dark"
        >
          {t("submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-6 text-sm font-bold text-ink/70"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
