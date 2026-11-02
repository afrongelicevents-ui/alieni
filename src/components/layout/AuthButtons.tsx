"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

/** Login/Sign up while logged out; a single "Account" button once signed in. */
export function AuthButtons() {
  const t = useTranslations("nav");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (signedIn) {
    return (
      <ButtonLink href="/account" variant="dark" className="px-5 py-2">
        {t("account")}
      </ButtonLink>
    );
  }
  return (
    <>
      <ButtonLink href="/login" variant="secondary" className="px-5 py-2">
        {t("login")}
      </ButtonLink>
      <ButtonLink href="/signup" variant="dark" className="hidden px-5 py-2 sm:inline-flex">
        {t("signup")}
      </ButtonLink>
    </>
  );
}
