"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { openService } from "@/app/[locale]/business/actions";

export type Tile = { key: "connect" | "cover" | "turnover" | "oneoff" | "contract"; enabled: boolean; offForType: boolean; href: string; count?: number };

const ICON: Record<Tile["key"], string> = {
  connect: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9.5 3-4.9-4.9",
  cover: "M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Zm0 5v4m0 3h.01",
  turnover: "M4 4h16v16H4V4Zm0 6h16M8 2v4m8-4v4m-6 8 2 2 4-4",
  oneoff: "M12 2l2.4 5.2L20 8l-4 3.9.9 5.6L12 14.8 7.1 17.5 8 11.9 4 8l5.6-.8L12 2Z",
  contract: "M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h6m-6 4h6",
};

/** One tile per service. Off = 'coming soon'; clicking it asks the server, which refuses too. */
export function ServiceTiles({ tiles }: { tiles: Tile[] }) {
  const t = useTranslations("business");
  const [notice, setNotice] = useState<string | null>(null);

  async function tryOpen(key: Tile["key"]) {
    const r = await openService(key);
    setNotice(r.ok ? null : t(`error_${r.error ?? "failed"}` as "error_failed"));
  }

  return (
    <section>
      <h3 className="headline text-xl text-ink">{t("tilesTitle")}</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => {
          const inner = (
            <>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile.enabled ? "bg-mint text-forest" : "bg-section text-ink/40"}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[tile.key]} /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-extrabold text-ink">{t(`tile_${tile.key}`)}</span>
                  {!tile.enabled ? <span className="shrink-0 rounded-full bg-sun/40 px-2 py-0.5 text-[11px] font-bold text-ink/80">{tile.offForType ? t("tileOff") : t("tileSoon")}</span> : null}
                  {tile.enabled && tile.count ? <span className="shrink-0 rounded-full bg-forest px-2 py-0.5 text-[11px] font-bold text-white">{tile.count}</span> : null}
                </span>
                <span className="mt-0.5 block text-sm text-ink/70">{t(`tileDesc_${tile.key}`)}</span>
              </span>
            </>
          );
          const cls = `flex min-h-20 w-full items-center gap-3 rounded-card-lg border p-4 text-left transition-colors ${tile.enabled ? "border-line bg-white hover:bg-mint/40" : "border-dashed border-line bg-section/60"}`;
          return (
            <li key={tile.key}>
              {tile.enabled ? (
                <Link href={tile.href} className={cls} data-tile={tile.key}>{inner}</Link>
              ) : (
                <button type="button" onClick={() => tryOpen(tile.key)} className={cls} data-tile={tile.key} data-enabled="false">{inner}</button>
              )}
            </li>
          );
        })}
      </ul>
      {notice ? <p role="status" className="mt-3 rounded-xl bg-sun/25 p-3 text-sm font-semibold text-ink/80">{notice}</p> : null}
    </section>
  );
}
