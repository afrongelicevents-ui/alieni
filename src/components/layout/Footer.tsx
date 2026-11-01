import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LogoLockup } from "@/components/brand/Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Footer() {
  const t = useTranslations();

  return (
    <footer className="border-t border-line bg-section pb-24 md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <LogoLockup size="lg" />
          <p className="mt-4 max-w-xs text-sm text-ink/70">{t("footer.notice")}</p>
          <div className="mt-4">
            <LocaleSwitcher />
          </div>
        </div>
        <nav aria-label="Footer" className="text-sm font-semibold text-forest">
          <ul className="space-y-2">
            <li><Link href="/search" className="hover:underline">{t("footer.forHouseholds")}</Link></li>
            <li><Link href="/signup" className="hover:underline">{t("footer.forCleaners")}</Link></li>
            <li><Link href="/jobs" className="hover:underline">{t("footer.forBusinesses")}</Link></li>
          </ul>
        </nav>
        <div className="text-sm text-ink/70">
          <ul className="space-y-2">
            <li><Link href="/terms" className="hover:underline">{t("footer.terms")}</Link></li>
            <li><Link href="/privacy" className="hover:underline">{t("footer.privacy")}</Link></li>
          </ul>
          <p className="mt-4 text-xs">{t("footer.pricing")}</p>
          <p className="mt-2 text-xs">© {new Date().getFullYear()} Alieni</p>
        </div>
      </div>
    </footer>
  );
}
