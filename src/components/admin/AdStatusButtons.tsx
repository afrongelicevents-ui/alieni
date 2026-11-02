"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setAdStatusAdmin } from "@/app/[locale]/admin/actions";

export function AdStatusButtons({ adId, status }: { adId: string; status: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(next: "published" | "hidden" | "removed") {
    setBusy(true);
    await setAdStatusAdmin(adId, next);
    setBusy(false);
    router.refresh();
  }
  const btn = "rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50";
  return (
    <>
      {status === "published" ? (
        <button type="button" disabled={busy} onClick={() => set("hidden")} className={`${btn} border border-line text-ink/70`}>{t("actionHide")}</button>
      ) : (
        <button type="button" disabled={busy} onClick={() => set("published")} className={`${btn} border border-forest text-forest`}>{t("actionRestore")}</button>
      )}
      {status !== "removed" ? (
        <button type="button" disabled={busy} onClick={() => set("removed")} className={`${btn} bg-red-700 text-white`}>{t("actionRemove")}</button>
      ) : null}
    </>
  );
}
