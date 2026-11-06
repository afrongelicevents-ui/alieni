"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEuro } from "@/lib/money";
import { useRouter } from "@/i18n/navigation";
import type { ConversationDetail } from "@/lib/chat-data";
import { confirmDeal, endConnection, setupHouseholdPayment } from "@/app/[locale]/messages/actions";

/**
 * Mutual "We have a deal" / "Not a match" (brief §3.7–3.9), both sides.
 * The database activates the connection once both parties confirmed; the
 * charging (if a price is ever switched on) hooks in here.
 */
export function DealPanelLive({ conversation }: { conversation: ConversationDetail }) {
  const t = useTranslations("deal");
  const lang = useLocale();
  const router = useRouter();
  // price wording only while a monthly price is actually active; otherwise the copy stays price-neutral
  const fee = conversation.paymentsEnabled && conversation.householdFeeCents ? formatEuro(conversation.householdFeeCents, lang) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conn = conversation.connection;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "failed");
    router.refresh();
  }

  const btnPrimary = "inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50";
  const btnGhost = "inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line px-5 text-sm font-bold text-ink/70 hover:bg-section disabled:opacity-50";

  async function pay() {
    setBusy(true);
    setError(null);
    const r = await setupHouseholdPayment(conversation.id);
    setBusy(false);
    if (r.ok && r.checkoutUrl) {
      window.location.href = r.checkoutUrl; // Mollie-hosted checkout (iDEAL)
      return;
    }
    setError(r.error ?? "failed");
  }

  if (conn?.status === "active" && conn.paused) {
    return (
      <div className="mt-3 rounded-card-lg border border-red-200 bg-red-50 p-4">
        <h3 className="font-extrabold text-ink">{t("pausedTitle")}</h3>
        <p className="mt-1 text-sm text-ink/80">{conversation.role === "household" ? t("pausedTextHousehold") : t("pausedTextCleaner")}</p>
        {conversation.role === "household" && !conversation.isBusiness && conversation.paymentsEnabled ? (
          <button type="button" disabled={busy} onClick={pay} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{t("payUpdateCta")}</button>
        ) : null}
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{t("error")}</p> : null}
      </div>
    );
  }

  if (conn?.status === "active") {
    const needsPayment = conversation.role === "household" && !conversation.isBusiness && !conn.paymentSetUp;
    return (
      <div className="mt-3 rounded-card-lg border border-forest/30 bg-mint p-4">
        <h3 className="font-extrabold text-ink">{t("activeTitle")}</h3>
        <p className="mt-1 text-sm text-ink/70">{conversation.role === "household" ? (fee ? t("activeTextPriced", { fee }) : t("activeText")) : t("activeTextCleaner")}</p>
        {needsPayment ? (
          conversation.paymentsEnabled && fee ? (
            <div className="mt-3 rounded-xl bg-white p-3">
              <p className="text-sm font-semibold text-ink">{t("payTitle")}</p>
              <p className="mt-1 text-xs text-ink/70">{t("payText", { fee: fee ?? "" })}</p>
              <button type="button" disabled={busy} onClick={pay} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-sun px-5 text-sm font-bold text-ink hover:bg-sun-dark disabled:opacity-50">{t("payCta")}</button>
            </div>
          ) : !conversation.paymentsEnabled ? (
            <p className="mt-3 rounded-xl bg-white p-3 text-xs text-ink/70">{t("payLater")}</p>
          ) : null
        ) : null}
        <button type="button" disabled={busy} onClick={() => run(() => endConnection(conversation.id))} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-forest px-5 text-sm font-bold text-forest hover:bg-white disabled:opacity-50">
          {t("endConnection")}
        </button>
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{t("error")}</p> : null}
      </div>
    );
  }

  if (conn?.status === "ended") {
    const wasActive = Boolean(conn.startedAt);
    return (
      <div className="mt-3 rounded-card bg-section px-4 py-3 text-sm text-ink/70">
        <p>{wasActive ? (fee ? t("endedNotePriced") : t("endedNote")) : t("noMatchNote")}</p>
        <button type="button" disabled={busy} onClick={() => run(() => confirmDeal(conversation.id))} className="mt-2 text-xs font-bold text-forest underline disabled:opacity-50">
          {t("reopen")}
        </button>
      </div>
    );
  }

  const mineConfirmed = conversation.role === "household" ? conn?.householdConfirmedAt : conn?.cleanerConfirmedAt;
  const otherConfirmed = conversation.role === "household" ? conn?.cleanerConfirmedAt : conn?.householdConfirmedAt;

  if (conn?.status === "pending" && mineConfirmed) {
    return (
      <div className="mt-3 rounded-card-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold text-ink/80">{t("waitingOther", { name: conversation.otherName })}</p>
        <button type="button" disabled={busy} onClick={() => run(() => endConnection(conversation.id))} className={`mt-3 ${btnGhost}`}>
          {t("withdraw")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-card-lg border border-line bg-white p-4">
      <h3 className="text-sm font-extrabold text-ink">{otherConfirmed ? t("otherConfirmed", { name: conversation.otherName }) : t("question")}</h3>
      <p className="mt-1 text-xs text-ink/70">{conversation.role === "household" ? (fee ? t("explainPriced", { fee }) : t("explain")) : t("explainCleaner")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(() => confirmDeal(conversation.id))} className={btnPrimary}>
          {t("yes")}
        </button>
        <button type="button" disabled={busy} onClick={() => run(() => endConnection(conversation.id))} className={btnGhost}>
          {t("no")}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{t("error")}</p> : null}
    </div>
  );
}
