import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConversationListLive } from "@/components/chat/ConversationListLive";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { getSessionUser } from "@/lib/auth";
import { listConversations } from "@/lib/chat-data";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("chat");
  const user = await getSessionUser();
  const conversations = user ? ((await listConversations(user.id)) ?? []) : null;

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <div className="mt-6">
        {conversations ? <ConversationListLive conversations={conversations} /> : <LoginPrompt next="/messages" text={t("loginText")} />}
      </div>
    </section>
  );
}
