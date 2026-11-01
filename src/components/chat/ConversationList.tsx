"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useConversations } from "@/lib/chat-store";
import { maskContacts } from "@/lib/masking";
import { getCleaner } from "@/lib/cleaners";
import { ButtonLink } from "@/components/ui/Button";

export function ConversationList() {
  const t = useTranslations("chat");
  const { conversations, hydrated } = useConversations();

  if (!hydrated) return null;

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="max-w-sm text-ink/70">{t("empty")}</p>
        <ButtonLink href="/search" variant="secondary">
          {t("browse")}
        </ButtonLink>
      </div>
    );
  }

  const sorted = [...conversations].sort((a, b) => {
    const lastA = a.messages[a.messages.length - 1]?.at ?? a.createdAt;
    const lastB = b.messages[b.messages.length - 1]?.at ?? b.createdAt;
    return lastB.localeCompare(lastA);
  });

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
      {sorted.map((conversation) => {
        const cleaner = getCleaner(conversation.cleanerId);
        const last = conversation.messages[conversation.messages.length - 1];
        const preview = last ? maskContacts(last.text).text : "";
        return (
          <li key={conversation.id}>
            <Link
              href={`/messages/${conversation.id}`}
              className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-section"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-forest/40">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="9" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold text-ink">{cleaner?.name ?? "—"}</span>
                <span className="block truncate text-sm text-ink/60">{preview}</span>
              </span>
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
