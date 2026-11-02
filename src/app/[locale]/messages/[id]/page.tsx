import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChatThreadLive } from "@/components/chat/ChatThreadLive";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { getSessionUser } from "@/lib/auth";
import { getConversation } from "@/lib/chat-data";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("chat");
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <LoginPrompt next={`/messages/${id}`} text={t("loginText")} />
      </section>
    );
  }

  const conversation = /^[0-9a-f-]{36}$/i.test(id) ? await getConversation(id, user.id) : null;
  if (!conversation) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-ink/70">{t("notFound")}</p>
        <Link href="/messages" className="mt-3 inline-block font-bold text-forest underline">
          {t("backToList")}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <ChatThreadLive conversation={conversation} />
    </section>
  );
}
