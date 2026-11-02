import { redirect } from "next/navigation";

/** The cleaner profile lives at /profile now; keep old links working. */
export default async function LegacyNewAdPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/profile`);
}
