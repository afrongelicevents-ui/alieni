"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS } from "@/lib/business";
import { formatEuro } from "@/lib/money";
import { PRICING_MODELS, SERVICE_KEYS, SERVICE_LABEL, type PricingRule } from "@/lib/services-shared";
import { savePricingRule, setPricingRuleActive, type PricingRuleInput } from "@/app/[locale]/admin/actions";

const inputCls = "min-h-10 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none";
const today = () => new Date().toISOString().slice(0, 10);

/** Admin → Pricing: rules table + add form. Nothing applies until a rule is activated. */
export function PricingRules({ rules, demo }: { rules: PricingRule[]; demo: boolean }) {
  const t = useTranslations("admin");
  const lang = (useLocale() === "en" ? "en" : "nl") as "nl" | "en";
  const router = useRouter();
  const [draft, setDraft] = useState<PricingRuleInput>({ serviceKey: "connect", businessType: "", model: "none", amountEuro: "", percent: "", unit: "", validFrom: today(), validTo: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggleFailed, setToggleFailed] = useState(false);
  const set = (p: Partial<PricingRuleInput>) => setDraft((d) => ({ ...d, ...p }));
  const activeCount = rules.filter((r) => r.active && r.model !== "none").length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return;
    setBusy(true); setNotice(null);
    const r = await savePricingRule(draft);
    setBusy(false);
    setNotice(r.ok ? t("ruleSaved") : r.error === "invalid" ? t("settingsInvalid") : t("actionFailed"));
    if (r.ok) router.refresh();
  }
  async function toggle(rule: PricingRule) {
    if (demo) return;
    setBusy(true); setToggleFailed(false);
    const r = await setPricingRuleActive(rule.id, !rule.active);
    setBusy(false);
    if (!r.ok) { setToggleFailed(true); return; }
    router.refresh();
  }

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("pricingTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("pricingIntro")}</p>
      <p className={`mt-3 rounded-xl p-3 text-sm font-semibold ${activeCount ? "bg-mint text-forest" : "bg-sun/30 text-ink/80"}`} data-active-rules={activeCount}>
        {t("pricingActiveCount", { count: activeCount })}{activeCount ? "" : ` — ${t("pricingNoneNote")}`}
      </p>

      {toggleFailed ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{t("actionFailed")}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-section text-xs font-semibold uppercase text-ink/70">
            <tr><th className="px-3 py-2">{t("colService")}</th><th className="px-3 py-2">{t("colType")}</th><th className="px-3 py-2">{t("colModel")}</th><th className="px-3 py-2 text-right">{t("colAmountExcl")}</th><th className="px-3 py-2">{t("colValidFrom")}</th><th className="px-3 py-2">{t("colValidTo")}</th><th className="px-3 py-2">{t("colActive")}</th><th className="px-3 py-2">{t("colNotes")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rules.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-ink/70">—</td></tr> : rules.map((r) => (
              <tr key={r.id} data-rule={r.id} className={r.active ? "" : "text-ink/60"}>
                <td className="px-3 py-2 font-semibold text-ink">{SERVICE_LABEL[r.service_key][lang]}</td>
                <td className="px-3 py-2">{r.business_type ? BUSINESS_TYPES[r.business_type].label[lang] : t("allTypes")}</td>
                <td className="px-3 py-2">{t(`model_${r.model}`)}</td>
                <td className="px-3 py-2 text-right font-bold">{r.model === "percent" ? `${r.percent ?? 0}%` : r.model === "none" ? "—" : `${formatEuro(r.amount_cents, lang)}${r.unit ? ` / ${r.unit}` : ""}`}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.valid_from}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.valid_to ?? "—"}</td>
                <td className="px-3 py-2">
                  <button type="button" disabled={busy || demo} onClick={() => toggle(r)} className={`rounded-full px-3 py-1 text-xs font-bold ${r.active ? "bg-mint text-forest" : "border border-line text-ink/70"}`}>{r.active ? t("deactivate") : t("activate")}</button>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs" title={r.notes ?? ""}>{r.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="mt-6 grid gap-3 rounded-card-lg border border-dashed border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-sm font-extrabold text-ink sm:col-span-2 lg:col-span-3">{t("addRule")} <span className="text-xs font-medium text-ink/60">· {t("ruleInactiveDefault")}</span></p>
        <label className="text-xs font-semibold text-ink/80">{t("colService")}
          <select value={draft.serviceKey} onChange={(e) => set({ serviceKey: e.target.value as PricingRuleInput["serviceKey"] })} className={`mt-1 ${inputCls}`}>
            {SERVICE_KEYS.map((k) => <option key={k} value={k}>{SERVICE_LABEL[k][lang]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink/80">{t("colType")}
          <select value={draft.businessType} onChange={(e) => set({ businessType: e.target.value as PricingRuleInput["businessType"] })} className={`mt-1 ${inputCls}`}>
            <option value="">{t("allTypes")}</option>
            {BUSINESS_TYPE_KEYS.map((k) => <option key={k} value={k}>{BUSINESS_TYPES[k].label[lang]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink/80">{t("colModel")}
          <select value={draft.model} onChange={(e) => set({ model: e.target.value as PricingRuleInput["model"] })} className={`mt-1 ${inputCls}`}>
            {PRICING_MODELS.map((m) => <option key={m} value={m}>{t(`model_${m}`)}</option>)}
          </select>
        </label>
        {draft.model === "percent" ? (
          <label className="text-xs font-semibold text-ink/80">{t("colPercent")}<input type="text" inputMode="decimal" value={draft.percent} onChange={(e) => set({ percent: e.target.value })} className={`mt-1 ${inputCls}`} /></label>
        ) : draft.model !== "none" ? (
          <label className="text-xs font-semibold text-ink/80">{t("colAmountExcl")}<input type="text" inputMode="decimal" placeholder="0,00" value={draft.amountEuro} onChange={(e) => set({ amountEuro: e.target.value })} className={`mt-1 ${inputCls}`} /></label>
        ) : null}
        {draft.model === "monthly_per_unit" ? <label className="text-xs font-semibold text-ink/80">{t("colUnitLabel")}<input type="text" value={draft.unit} onChange={(e) => set({ unit: e.target.value })} className={`mt-1 ${inputCls}`} /></label> : null}
        <label className="text-xs font-semibold text-ink/80">{t("colValidFrom")}<input type="date" value={draft.validFrom} onChange={(e) => set({ validFrom: e.target.value })} className={`mt-1 ${inputCls}`} required /></label>
        <label className="text-xs font-semibold text-ink/80">{t("colValidTo")}<input type="date" value={draft.validTo} onChange={(e) => set({ validTo: e.target.value })} className={`mt-1 ${inputCls}`} /></label>
        <label className="text-xs font-semibold text-ink/80 sm:col-span-2 lg:col-span-3">{t("colNotes")}<input type="text" maxLength={300} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={`mt-1 ${inputCls}`} /></label>
        <button type="submit" disabled={busy || demo} className="inline-flex min-h-10 items-center justify-center rounded-full bg-forest px-5 text-sm font-bold text-white disabled:opacity-50">{t("saveRule")}</button>
        {notice ? <p role="status" className="self-center text-sm font-semibold text-forest sm:col-span-2">{notice}</p> : null}
      </form>
    </div>
  );
}
