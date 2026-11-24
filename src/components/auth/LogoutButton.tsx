"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const t = useTranslations("account");
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await authClient.signOut().catch(() => null);
    // Full reload: every server component must see that the session cookie is gone.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the server sees the new session state
    window.location.assign("/");
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-bold text-ink/80 hover:bg-section disabled:opacity-50"
    >
      {t("logout")}
    </button>
  );
}
