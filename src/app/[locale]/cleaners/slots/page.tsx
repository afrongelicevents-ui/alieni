import { redirect } from "next/navigation";

export default async function LegacySlotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/work?tab=turnovers`);
}
