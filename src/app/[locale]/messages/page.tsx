import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConversationList } from "@/components/chat/ConversationList";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("chat");
  const tCommon = await getTranslations("common");

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="headline text-3xl text-ink">{t("title")}</h1>
        <span className="rounded-full bg-sun/30 px-3 py-1 text-xs font-semibold text-ink/70">
          {tCommon("sampleBadge")}
        </span>
      </div>
      <div className="mt-6">
        <ConversationList />
      </div>
    </section>
  );
}
