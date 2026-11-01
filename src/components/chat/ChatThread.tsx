"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useConversations } from "@/lib/chat-store";
import { maskContacts } from "@/lib/masking";
import { getCleaner } from "@/lib/cleaners";
import { formatHourlyRate } from "@/lib/money";
import { DealPanel } from "./DealPanel";

export function ChatThread({ conversationId }: { conversationId: string }) {
  const t = useTranslations("chat");
  const tMeeting = useTranslations("meeting");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";
  const { conversations, hydrated, sendMessage } = useConversations();
  const [draft, setDraft] = useState("");

  if (!hydrated) return null;

  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink/70">{t("notFound")}</p>
        <Link href="/messages" className="mt-3 inline-block font-bold text-forest underline">
          {t("backToList")}
        </Link>
      </div>
    );
  }

  const cleaner = getCleaner(conversation.cleanerId);
  const connectionActive = conversation.connection?.status === "active";
  const draftPreview = maskContacts(draft);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(conversationId, draft);
    setDraft("");
  }

  return (
    <div className="flex flex-col">
      {/* thread header */}
      <div className="flex items-center gap-3 rounded-card-lg border border-line bg-white p-4">
        <Link href="/messages" aria-label={t("backToList")} className="flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-mint">
          <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M10 3 5 8l5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint text-forest/40">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="9" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </span>
        <div className="min-w-0">
          {cleaner ? (
            <Link href={`/cleaners/${cleaner.id}`} className="block truncate font-extrabold text-ink hover:underline">
              {cleaner.name}
            </Link>
          ) : (
            <span className="font-extrabold text-ink">—</span>
          )}
          {cleaner ? (
            <span className="block text-xs text-ink/60">
              {formatHourlyRate(cleaner.rateCents, locale)}/
              {locale === "nl" ? "uur" : "hr"} · {cleaner.city}
            </span>
          ) : null}
        </div>
      </div>

      {/* meeting summary */}
      {conversation.meeting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card bg-mint px-4 py-3 text-sm font-semibold text-forest">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2" strokeWidth="2" />
            <path d="M3.5 9.5h17M8 3v4m8-4v4" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {tMeeting("summary", {
            type: conversation.meeting.type === "in_person" ? tMeeting("inPerson") : tMeeting("video"),
            day: tCommon(`day${conversation.meeting.weekday}` as "day0"),
            block: tCommon(conversation.meeting.block).toLowerCase(),
          })}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs">{tMeeting("statusRequested")}</span>
        </div>
      ) : null}

      {/* masking notice / unlocked notice */}
      {connectionActive ? (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-mint px-4 py-3 text-xs font-semibold text-forest">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 7.5-2" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t("unlockedNotice")}
        </p>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-section px-4 py-3 text-xs text-ink/70">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-forest" fill="none" stroke="currentColor" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t("maskingNotice")}
        </p>
      )}

      {/* deal confirmation / connection state */}
      <DealPanel conversation={conversation} cleanerName={cleaner?.name ?? "—"} />

      {/* messages */}
      <ol className="mt-4 flex flex-col gap-2">
        {conversation.messages.map((message) => {
          const { text, masked } = connectionActive
            ? { text: message.text, masked: false }
            : maskContacts(message.text);
          const mine = message.from === "me";
          return (
            <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine ? "rounded-br-md bg-forest text-white" : "rounded-bl-md bg-section text-ink"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{text}</p>
                {masked ? (
                  <p className={`mt-1 text-[11px] font-semibold ${mine ? "text-white/70" : "text-ink/50"}`}>
                    🔒 {t("maskedTag")}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* composer */}
      <form onSubmit={submit} className="sticky bottom-16 mt-4 md:bottom-4">
        {draft && !connectionActive && draftPreview.masked ? (
          <p className="mb-2 rounded-xl bg-sun/30 px-3 py-2 text-xs font-medium text-ink/80">{t("willBeMasked")}</p>
        ) : null}
        <div className="flex items-end gap-2 rounded-card-lg border border-line bg-white p-2 shadow-lg shadow-forest/5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inputPlaceholder")}
            rows={1}
            maxLength={4000}
            aria-label={t("inputPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(conversationId, draft);
                setDraft("");
              }
            }}
            className="max-h-32 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-sm text-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t("send")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest text-white transition-colors hover:bg-forest-dark disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M4 12 20 4l-4 16-4.5-6.5L4 12Zm7.5 1.5L20 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
