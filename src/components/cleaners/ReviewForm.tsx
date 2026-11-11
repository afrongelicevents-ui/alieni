"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { submitReview } from "@/app/[locale]/reviews/actions";

/** Rate a cleaner you have a confirmed deal with: 1-5 stars and an optional comment. */
export function ReviewForm({ cleanerProfileId }: { cleanerProfileId: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return setError(t("reviewRatingError"));
    setBusy(true); setError(null);
    const r = await submitReview({ cleanerProfileId, rating, body });
    setBusy(false);
    if (!r.ok) return setError(t(`reviewError_${r.error ?? "failed"}` as "reviewError_failed"));
    router.refresh();
  }

  return (
    <form onSubmit={send} className="mt-4 rounded-card-lg border border-line bg-white p-4" data-review-form>
      <h3 className="font-extrabold text-ink">{t("reviewFormTitle")}</h3>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t("reviewRatingLabel")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("reviewStars", { count: n })} onClick={() => setRating(n)} className={`min-h-11 min-w-11 rounded-full border text-lg ${rating >= n ? "border-sun-dark bg-sun text-white" : "border-line bg-white text-ink/40"}`}>★</button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold text-ink/80" htmlFor="review-body">{t("reviewBodyLabel")}</label>
      <textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} className="mt-1 min-h-20 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none" />
      {error ? <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-forest px-6 text-sm font-bold text-white disabled:opacity-50">{t("reviewSend")}</button>
    </form>
  );
}
