"use client";

import { useLocale, useTranslations } from "next-intl";
import { useConversations, type LocalConversation } from "@/lib/chat-store";
import { formatEuro, HOUSEHOLD_FEE_CENTS, splitBtw } from "@/lib/money";
import { COMPANY_DETAILS } from "@/lib/invoices";

/**
 * Mutual "We have a deal" / "Not a match" flow (brief §3.7–3.9).
 * Only when BOTH confirm: charge €14.95, unlock contacts, issue invoice.
 */
export function DealPanel({ conversation, cleanerName }: { conversation: LocalConversation; cleanerName: string }) {
  const t = useTranslations("deal");
  const locale = useLocale() as "nl" | "en";
  const { confirmDeal, noMatch, endConnection } = useConversations();

  const connection = conversation.connection;
  const { netCents, btwCents } = splitBtw(HOUSEHOLD_FEE_CENTS);

  if (connection?.status === "active") {
    return (
      <div className="mt-3 rounded-card-lg border border-forest/30 bg-mint p-4">
        <h3 className="font-extrabold text-ink">{t("activeTitle")}</h3>
        <p className="mt-1 text-sm text-ink/70">{t("activeText")}</p>
        {connection.invoiceNumber ? (
          <dl className="mt-3 rounded-xl bg-white p-4 text-sm">
            <div className="flex justify-between font-bold text-ink">
              <dt>{t("invoiceTitle", { number: connection.invoiceNumber })}</dt>
              <dd>{COMPANY_DETAILS.name} · {COMPANY_DETAILS.kvk} · {COMPANY_DETAILS.btw}</dd>
            </div>
            <div className="mt-2 flex justify-between text-ink/70">
              <dt>{t("invoiceNet")}</dt>
              <dd>{formatEuro(netCents, locale)}</dd>
            </div>
            <div className="flex justify-between text-ink/70">
              <dt>{t("invoiceVat")}</dt>
              <dd>{formatEuro(btwCents, locale)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-line pt-1 font-extrabold text-ink">
              <dt>{t("invoiceTotal")}</dt>
              <dd>{formatEuro(HOUSEHOLD_FEE_CENTS, locale)}</dd>
            </div>
          </dl>
        ) : null}
        <button
          type="button"
          onClick={() => endConnection(conversation.id)}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-white"
        >
          {t("endConnection")}
        </button>
      </div>
    );
  }

  if (connection?.status === "ended") {
    return (
      <p className="mt-3 rounded-card bg-section px-4 py-3 text-sm text-ink/70">{t("endedNote")}</p>
    );
  }

  if (connection?.status === "no_match") {
    return (
      <p className="mt-3 rounded-card bg-section px-4 py-3 text-sm text-ink/70">{t("noMatchNote")}</p>
    );
  }

  if (connection?.status === "pending" && connection.householdConfirmedAt) {
    return (
      <div className="mt-3 rounded-card-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold text-ink/80">{t("waitingOther", { name: cleanerName })}</p>
        <button
          type="button"
          onClick={() => confirmDeal(conversation.id, "cleaner")}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-dashed border-forest/50 px-5 text-sm font-bold text-forest hover:bg-mint"
        >
          {t("simulateOther", { name: cleanerName })}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-card-lg border border-line bg-white p-4">
      <h3 className="text-sm font-extrabold text-ink">{t("question")}</h3>
      <p className="mt-1 text-xs text-ink/60">{t("explain")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => confirmDeal(conversation.id, "household")}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark"
        >
          {t("yes")}
        </button>
        <button
          type="button"
          onClick={() => noMatch(conversation.id)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-5 text-sm font-bold text-ink/70 hover:bg-section"
        >
          {t("no")}
        </button>
      </div>
    </div>
  );
}
