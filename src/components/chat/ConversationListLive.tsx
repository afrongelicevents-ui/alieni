import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ConversationSummary } from "@/lib/chat-data";
import { ButtonLink } from "@/components/ui/Button";

export async function ConversationListLive({ conversations }: { conversations: ConversationSummary[] }) {
  const t = await getTranslations("chat");

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

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link href={`/messages/${c.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-section">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-forest/40">
              {c.otherPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- storage URL, pre-sized
                <img src={c.otherPhoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="9" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-extrabold text-ink">{c.otherName}</span>
                {c.connection === "active" ? <span className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-bold text-white">{t("connected")}</span> : null}
                {c.connection === "pending" ? <span className="rounded-full bg-sun/40 px-2 py-0.5 text-[11px] font-bold text-ink">{t("dealPending")}</span> : null}
              </span>
              <span className="block truncate text-sm text-ink/70">{c.lastMessage ?? t("noMessagesYet")}</span>
            </span>
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
