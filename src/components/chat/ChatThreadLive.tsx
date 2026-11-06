"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { maskContacts } from "@/lib/masking";
import { formatHourlyRate } from "@/lib/money";
import type { ConversationDetail } from "@/lib/chat-data";
import { ReportButton } from "@/components/cleaners/ReportButton";
import { answerMeetingProposal, proposeMeetingTime, respondMeeting, sendMessage, withdrawMeeting } from "@/app/[locale]/messages/actions";
import { createClient } from "@/lib/supabase/client";
import { DealPanelLive } from "./DealPanelLive";

const POLL_MS = 8000; // fallback while realtime is not connected
const POLL_REALTIME_MS = 60000; // slow safety net once it is

/** Live chat thread: server data in, server actions out; new messages arrive through realtime, with polling as the fallback. */
export function ChatThreadLive({ conversation }: { conversation: ConversationDetail }) {
  const t = useTranslations("chat");
  const tMeeting = useTranslations("meeting");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "nl" | "en";
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ id: string; body: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // New messages arrive through Supabase realtime; polling stays as the fallback (fast until realtime connects, slow after).
  const [live, setLive] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, () => router.refresh())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, router]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, live ? POLL_REALTIME_MS : POLL_MS);
    return () => clearInterval(id);
  }, [router, live]);

  // Drop optimistic messages once the server copy arrives.
  useEffect(() => {
    if (pending.length === 0) return;
    const bodies = new Set(conversation.messages.filter((m) => m.mine).map((m) => m.body));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile optimistic list with server data
    setPending((p) => p.filter((x) => !bodies.has(x.body) && !bodies.has(maskContacts(x.body).text)));
  }, [conversation.messages, pending.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages.length, pending.length]);

  const connectionActive = conversation.connection?.status === "active";
  const draftPreview = maskContacts(draft);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    setPending((p) => [...p, { id: `tmp-${Date.now()}`, body: text }]);
    const result = await sendMessage(conversation.id, text);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "failed");
      setPending((p) => p.filter((x) => x.body !== text));
      setDraft(text);
    } else {
      router.refresh();
    }
  }

  async function respond(status: "accepted" | "declined") {
    if (!conversation.meeting) return;
    setBusy(true);
    setError(null);
    const r = await respondMeeting(conversation.meeting.id, status);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "failed"); return; }
    router.refresh();
  }

  const meeting = conversation.meeting;
  const [proposing, setProposing] = useState(false);
  const [propDay, setPropDay] = useState(0);
  const [propBlock, setPropBlock] = useState<"morning" | "afternoon" | "evening">("morning");

  async function runMeeting(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "failed"); return; }
    setProposing(false);
    router.refresh();
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
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
          {conversation.otherPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- storage URL, pre-sized
            <img src={conversation.otherPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="9" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          )}
        </span>
        <div className="min-w-0">
          {conversation.role === "household" && conversation.cleaner ? (
            <Link href={`/cleaners/${conversation.cleaner.profileId}`} className="block truncate font-extrabold text-ink hover:underline">
              {conversation.otherName}
            </Link>
          ) : (
            <span className="block truncate font-extrabold text-ink">{conversation.otherName}</span>
          )}
          {conversation.role === "household" && conversation.cleaner ? (
            <span className="block text-xs text-ink/70">
              {formatHourlyRate(conversation.cleaner.rateCents, locale)}/{t("hourUnit")}
              {conversation.cleaner.city ? ` · ${conversation.cleaner.city}` : ""}
            </span>
          ) : (
            <span className="block text-xs text-ink/70">{t("householdLabel")}</span>
          )}
        </div>
      </div>

      {/* meeting summary + cleaner response */}
      {meeting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card bg-mint px-4 py-3 text-sm font-semibold text-forest">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2" strokeWidth="2" />
            <path d="M3.5 9.5h17M8 3v4m8-4v4" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {tMeeting("summary", {
            type: meeting.type === "in_person" ? tMeeting("inPerson") : tMeeting("video"),
            day: tCommon(`day${meeting.weekday}` as "day0"),
            block: tCommon(meeting.block).toLowerCase(),
          })}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs">{tMeeting(`status_${meeting.status}` as "status_requested")}</span>
          {conversation.role === "cleaner" && (meeting.status === "requested" || meeting.status === "accepted" || meeting.status === "rescheduled") ? (
            <span className="ml-auto flex flex-wrap gap-2">
              {meeting.status === "requested" ? (
                <>
                  <button type="button" disabled={busy} onClick={() => respond("accepted")} className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white disabled:opacity-50">{tMeeting("accept")}</button>
                  <button type="button" disabled={busy} onClick={() => respond("declined")} className="rounded-full border border-forest/40 bg-white px-3 py-1 text-xs font-bold text-forest disabled:opacity-50">{tMeeting("decline")}</button>
                </>
              ) : null}
              <button type="button" disabled={busy} onClick={() => setProposing((v) => !v)} className="rounded-full border border-forest/40 bg-white px-3 py-1 text-xs font-bold text-forest disabled:opacity-50" data-propose-time>{tMeeting("proposeOther")}</button>
            </span>
          ) : null}
          {conversation.role === "household" && meeting.status === "rescheduled" ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink/80">{tMeeting("proposedByCleaner")}</span>
              <button type="button" disabled={busy} onClick={() => runMeeting(() => answerMeetingProposal(meeting.id, true))} className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white disabled:opacity-50">{tMeeting("acceptProposal")}</button>
              <button type="button" disabled={busy} onClick={() => runMeeting(() => answerMeetingProposal(meeting.id, false))} className="rounded-full border border-forest/40 bg-white px-3 py-1 text-xs font-bold text-forest disabled:opacity-50">{tMeeting("declineProposal")}</button>
            </span>
          ) : null}
          {conversation.role === "household" && (meeting.status === "requested" || meeting.status === "accepted" || meeting.status === "rescheduled") ? (
            <button type="button" disabled={busy} onClick={() => runMeeting(() => withdrawMeeting(meeting.id))} className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-800 disabled:opacity-50">{tMeeting("withdraw")}</button>
          ) : null}
          {proposing && conversation.role === "cleaner" ? (
            <span className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-ink">
              <select value={propDay} onChange={(e) => setPropDay(Number(e.target.value))} aria-label={tMeeting("proposeDay")} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{tCommon(`day${d}` as "day0")}</option>)}
              </select>
              <select value={propBlock} onChange={(e) => setPropBlock(e.target.value as "morning" | "afternoon" | "evening")} aria-label={tMeeting("proposeBlock")} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm">
                {(["morning", "afternoon", "evening"] as const).map((b) => <option key={b} value={b}>{tCommon(b)}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => runMeeting(() => proposeMeetingTime(meeting.id, propDay, propBlock))} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white disabled:opacity-50" data-send-proposal>{tMeeting("proposeSend")}</button>
            </span>
          ) : null}
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

      <DealPanelLive conversation={conversation} />

      {/* messages */}
      <ol className="mt-4 flex flex-col gap-2">
        {conversation.messages.map((message) => (
          <li key={message.id} className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${message.mine ? "rounded-br-md bg-forest text-white" : "rounded-bl-md bg-section text-ink"}`}>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              {message.masked && message.body.includes("•") ? (
                <p className={`mt-1 text-[11px] font-semibold ${message.mine ? "text-white/85" : "text-ink/70"}`}>🔒 {t("maskedTag")}</p>
              ) : null}
            </div>
            {!message.mine ? <div className="max-w-[90%]"><ReportButton subjectId={message.id} subjectType="message" compact /></div> : null}
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex justify-end opacity-60">
            <div className="max-w-[80%] rounded-2xl rounded-br-md bg-forest px-4 py-2.5 text-sm text-white">
              <p className="whitespace-pre-wrap break-words">{connectionActive ? p.body : maskContacts(p.body).text}</p>
            </div>
          </li>
        ))}
        {conversation.messages.length === 0 && pending.length === 0 ? (
          <li className="py-6 text-center text-sm text-ink/60">{t("noMessagesYet")}</li>
        ) : null}
        <div ref={bottomRef} />
      </ol>

      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{t.has(`error_${error}` as "error_failed") ? t(`error_${error}` as "error_failed") : t("error_failed")}</p> : null}

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="sticky bottom-16 mt-4 md:bottom-4"
      >
        {draft && !connectionActive && draftPreview.masked ? (
          <p className="mb-2 rounded-xl bg-sun/30 px-3 py-2 text-xs font-medium text-ink/80">{t("willBeMasked")}</p>
        ) : null}
        <div className="flex items-end gap-2 rounded-card-lg border border-line bg-white p-2 shadow-lg shadow-forest/5">
          <textarea
            id="chat-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inputPlaceholder")}
            rows={1}
            maxLength={4000}
            aria-label={t("inputPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-sm text-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
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
