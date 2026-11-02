"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const t = useTranslations("account");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
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
