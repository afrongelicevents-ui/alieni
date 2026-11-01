import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const items = [
  { href: "/messages", key: "messages" },
  { href: "/favourites", key: "favourites" },
  { href: "/cleaners/new", key: "myAd" },
  { href: "/login", key: "loginSignup" },
] as const;

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  return (
    <section className="mx-auto max-w-md px-4 py-10">
      <h1 className="headline text-3xl text-ink">{t("title")}</h1>
      <p className="mt-2 text-sm text-ink/70">{t("intro")}</p>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card-lg border border-line bg-white">
        {items.map(({ href, key }) => (
          <li key={key}>
            <Link href={href} className="flex min-h-14 items-center justify-between px-5 font-bold text-ink transition-colors hover:bg-section">
              {t(key)}
              <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink/40" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="m6 3 5 5-5 5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
