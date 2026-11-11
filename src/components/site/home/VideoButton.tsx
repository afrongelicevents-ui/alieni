"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/site/Icon";
import { videoEmbedUrl } from "@/lib/video";

/** "Watch video" button + modal. Only rendered when admin has set a video URL. */
export function VideoButton({ url, label, closeLabel }: { url: string; label: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const embed = videoEmbedUrl(url);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!embed) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 items-center gap-2.5 text-[15px] font-semibold">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current">
          <Icon name="play" className="h-5 w-5" />
        </span>
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(960px,92vw)] rounded-2xl bg-black p-0 backdrop:bg-navy-deep/80"
      >
        <div className="flex justify-end bg-black p-1">
          <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10">
            <Icon name="close" className="h-6 w-6" />
          </button>
        </div>
        {open ? (
          <div className="relative aspect-video">
            <iframe src={embed} title={label} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
