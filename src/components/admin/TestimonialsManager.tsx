"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminTestimonial } from "@/lib/admin/data";
import { addTestimonial, deleteTestimonial, setTestimonialPublished } from "@/app/[locale]/admin/actions";

const empty = { name: "", role: "", city: "", quote: "", consent: false, published: true };
const inputCls = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";

/**
 * Admin → Testimonials (brief §8). Only REAL testimonials, with the person's
 * consent. The homepage section stays hidden while none are published.
 */
export function TestimonialsManager({ items, demo }: { items: AdminTestimonial[]; demo: boolean }) {
  const t = useTranslations("admin");
  const [list, setList] = useState(items);
  const [form, setForm] = useState(empty);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (demo || !form.consent) return;
    setBusy(true);
    setNotice(null);
    const r = await addTestimonial({ ...form, consent: true });
    setBusy(false);
    if (r.ok) {
      setList((l) => [{ id: crypto.randomUUID(), name: form.name, role: form.role || null, city: form.city || null, quote: form.quote, published: form.published, created_at: new Date().toISOString() }, ...l]);
      setForm(empty);
      setNotice(t("savedNote"));
    } else setNotice(t("actionFailed"));
  }

  async function toggle(id: string, published: boolean) {
    const r = await setTestimonialPublished(id, published);
    if (r.ok) setList((l) => l.map((x) => (x.id === id ? { ...x, published } : x)));
    setNotice(r.ok ? t("savedNote") : t("actionFailed"));
  }

  async function remove(id: string) {
    if (!window.confirm(t("testDeleteConfirm"))) return;
    const r = await deleteTestimonial(id);
    if (r.ok) setList((l) => l.filter((x) => x.id !== id));
    setNotice(r.ok ? t("savedNote") : t("actionFailed"));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="headline text-xl text-ink">{t("tabTestimonials")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("testIntro")}</p>

      <form onSubmit={add} className="mt-4 grid gap-3 rounded-card-lg border border-line bg-white p-5 sm:grid-cols-3">
        <label className="text-sm font-semibold text-ink/80">{t("testName")}<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></label>
        <label className="text-sm font-semibold text-ink/80">{t("testRole")}<input maxLength={80} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls} /></label>
        <label className="text-sm font-semibold text-ink/80">{t("testCity")}<input maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></label>
        <label className="text-sm font-semibold text-ink/80 sm:col-span-3">{t("testQuote")}<textarea required maxLength={600} rows={3} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} className={inputCls} /></label>
        <label className="flex items-start gap-3 text-sm font-semibold text-ink/80 sm:col-span-3">
          <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-5 w-5 accent-royal" />
          {t("testConsent")}
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-ink/80 sm:col-span-3">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="h-5 w-5 accent-royal" />
          {t("testPublish")}
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={busy || demo || !form.consent} className="inline-flex min-h-11 items-center rounded-full bg-forest px-6 text-sm font-bold text-white disabled:opacity-50">{t("testAdd")}</button>
        </div>
      </form>

      {notice ? <p role="status" className="mt-3 text-sm font-semibold text-forest">{notice}</p> : null}

      <ul className="mt-6 space-y-3">
        {list.length === 0 ? <li className="text-sm text-ink/70">{t("testNone")}</li> : null}
        {list.map((x) => (
          <li key={x.id} className="rounded-card-lg border border-line bg-white p-4">
            <p className="text-sm text-ink">“{x.quote}”</p>
            <p className="mt-2 text-xs text-ink/70">
              <strong className="text-ink">{x.name}</strong>
              {[x.role, x.city].filter(Boolean).length ? ` · ${[x.role, x.city].filter(Boolean).join(", ")}` : ""} · {x.published ? t("testPublished") : t("testHidden")}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => toggle(x.id, !x.published)} className="min-h-9 rounded-full border border-forest px-4 text-xs font-bold text-forest">{x.published ? t("testHide") : t("testShow")}</button>
              <button type="button" onClick={() => remove(x.id)} className="min-h-9 rounded-full border border-red-700 px-4 text-xs font-bold text-red-700">{t("testDelete")}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
