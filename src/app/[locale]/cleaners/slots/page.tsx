import { getTranslations, setRequestLocale } from "next-intl/server";
import { SlotsList } from "@/components/cleaners/SlotsList";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { getSessionUser } from "@/lib/auth";
import { getSlotsForCleaner } from "@/lib/business-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CleanerSlotsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calendar");
  const user = await getSessionUser();
  let slots: Awaited<ReturnType<typeof getSlotsForCleaner>> = [];
  let myCleanerId: string | null = null;
  if (user) {
    const supabase = (await createClient())!;
    const { data: cp } = await supabase.from("cleaner_profiles").select("id").eq("user_id", user.id).maybeSingle();
    myCleanerId = cp?.id ?? null;
    slots = await getSlotsForCleaner();
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("cleanerTitle")}</h1>
      <p className="mt-2 text-sm text-ink/70">{t("cleanerIntro")}</p>
      <div className="mt-6">
        {user ? <SlotsList slots={slots} myCleanerId={myCleanerId} /> : <LoginPrompt next="/cleaners/slots" />}
      </div>
    </section>
  );
}
