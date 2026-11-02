"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { removeSiteImage, uploadSiteImage, type MediaActionState } from "@/app/[locale]/admin/media/actions";

export type MediaSlotView = {
  slot: string;
  aspect: "3/4" | "3/2";
  maxWidth: number;
  currentUrl: string | null;
  source: "uploaded" | "bundled" | "none";
  updatedAt: string | null;
};

const INITIAL: MediaActionState = { ok: false };

/**
 * Admin → Foto's: one card per photo slot. Pick a file → preview → upload.
 * Files are re-encoded to WebP on the server and stored in Supabase Storage.
 */
export function MediaManager({ slots, configured }: { slots: MediaSlotView[]; configured: boolean }) {
  return (
    <ul className="mt-6 grid gap-5 md:grid-cols-2">
      {slots.map((s) => (
        <li key={s.slot}>
          <SlotCard view={s} configured={configured} />
        </li>
      ))}
    </ul>
  );
}

function SlotCard({ view, configured }: { view: MediaSlotView; configured: boolean }) {
  const t = useTranslations("admin.media");
  const locale = useLocale();
  const [uploadState, uploadAction, uploading] = useActionState(uploadSiteImage, INITIAL);
  const [removeState, removeAction, removing] = useActionState(removeSiteImage, INITIAL);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Clear the local preview once the upload succeeded (server image takes over).
  useEffect(() => {
    if (uploadState.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [uploadState]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  const shown = preview ?? view.currentUrl;
  const busy = uploading || removing;
  const state = uploading || uploadState.slot === view.slot ? uploadState : removeState;
  const errorKey = !state.ok && state.error ? `error_${state.error}` : null;
  const aspectCls = view.aspect === "3/4" ? "aspect-[3/4] max-w-[240px]" : "aspect-[3/2]";

  return (
    <article className="rounded-card-lg border border-line bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">{t(`slot_${view.slot}`)}</h3>
          <p className="text-xs text-ink/60">{t(`where_${view.slot}`)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${view.source === "uploaded" ? "bg-mint text-forest" : view.source === "bundled" ? "bg-sun/30 text-ink" : "bg-section text-ink/60"}`}>
          {t(`source_${view.source}`)}
        </span>
      </header>

      <div className={`mt-4 w-full overflow-hidden rounded-2xl bg-mint ${aspectCls}`}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview, blob: or remote URL
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-forest/60">{t("empty")}</div>
        )}
      </div>

      <form action={uploadAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="slot" value={view.slot} />
        <label className="text-sm font-semibold text-ink/80">
          {t("chooseFile")}
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            disabled={!configured || busy}
            required
            className="mt-1 block w-full text-sm text-ink/80 file:mr-3 file:rounded-full file:border-0 file:bg-section file:px-4 file:py-2 file:text-sm file:font-bold file:text-forest"
          />
          <span className="mt-1 block text-xs text-ink/60">{t("hint", { px: view.maxWidth, aspect: view.aspect.replace("/", ":") })}</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!configured || busy}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white transition-colors hover:bg-forest-dark disabled:opacity-50"
          >
            {uploading ? t("uploading") : t("upload")}
          </button>
          {view.source === "uploaded" ? (
            <button
              type="submit"
              formAction={removeAction}
              disabled={!configured || busy}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-bold text-ink/80 hover:bg-section disabled:opacity-50"
            >
              {removing ? t("removing") : t("remove")}
            </button>
          ) : null}
        </div>
        {state.slot === view.slot && state.ok ? (
          <p className="text-sm font-semibold text-forest">{t("saved")}</p>
        ) : null}
        {state.slot === view.slot && errorKey ? (
          <p className="text-sm font-semibold text-red-700">{t(errorKey)}</p>
        ) : null}
      </form>

      {view.updatedAt ? (
        <p className="mt-3 text-xs text-ink/50">
          {t("updatedAt", { date: new Date(view.updatedAt).toLocaleString(locale === "en" ? "en-GB" : "nl-NL", { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      ) : null}
    </article>
  );
}
