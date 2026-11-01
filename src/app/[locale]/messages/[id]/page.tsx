import { setRequestLocale } from "next-intl/server";
import { ChatThread } from "@/components/chat/ChatThread";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <ChatThread conversationId={id} />
    </section>
  );
}
