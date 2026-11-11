import { Link } from "@/i18n/navigation";

export default function DesignPreviewIndex() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-navy">
      <h1 className="headline text-3xl">Alieni — design preview</h1>
      <p className="mt-2 text-body">Dev-only. Not linked from the site and not indexed.</p>
      <ul className="mt-6 space-y-2 font-semibold text-royal">
        <li><Link href="/design-preview/desktop">Desktop website (1440px)</Link></li>
        <li><Link href="/design-preview/mobile-web">Mobile website (390px)</Link></li>
      </ul>
    </div>
  );
}
