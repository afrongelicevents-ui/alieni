import "server-only";
import { formatEuro } from "./money";
import { companyLine } from "./company";
import type { Invoice } from "./invoices";

/**
 * Transactional email via Resend (brief §6, §12 automations). Plain-text
 * on purpose: deliverability, accessibility, and nothing to maintain.
 * No-ops with a console warning while RESEND_API_KEY is not configured.
 */

/** Language of an e-mail, from profiles.locale. */
export type Lang = "nl" | "en";

/** Picks the Dutch or the English variant. */
export const pick = <T,>(lang: Lang, nl: T, en: T): T => (lang === "en" ? en : nl);

const FROM = "Alieni <no-reply@alieni.nl>";

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("sendEmail: RESEND_API_KEY is not configured; e-mail skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    if (!res.ok) console.warn(`sendEmail: provider answered ${res.status}`);
    return res.ok;
  } catch {
    console.warn("sendEmail: request to the provider failed");
    return false;
  }
}

/** Invoice email with the 21% btw breakdown (brief §3.7, §6). */
export function invoiceEmail(invoice: Invoice, lang: Lang = "nl"): { subject: string; text: string } {
  return {
    subject: pick(lang, `Factuur ${invoice.number} — Alieni`, `Invoice ${invoice.number} — Alieni`),
    text: lang === "en"
      ? [
          "Hi!",
          "",
          "Thanks for your connection via Alieni. Here is your invoice:",
          "",
          `Invoice number:   ${invoice.number}`,
          `Description:      ${invoice.description}`,
          `Date:             ${invoice.issuedAt.slice(0, 10)}`,
          "",
          `Amount excl. VAT: ${formatEuro(invoice.netCents)}`,
          `21% VAT:          ${formatEuro(invoice.btwCents)}`,
          `Total incl. VAT:  ${formatEuro(invoice.grossCents)}`,
          "",
          "The amount was collected automatically via your linked payment method.",
          "You can cancel at any time with one tap in the app — the subscription",
          "then ends at the end of the current month.",
          "",
          companyLine(),
          "Connect · Clean · Thrive",
        ].join("\n")
      : [
          "Hoi!",
          "",
          "Bedankt voor je verbinding via Alieni. Hierbij je factuur:",
          "",
          `Factuurnummer:   ${invoice.number}`,
          `Omschrijving:    ${invoice.description}`,
          `Datum:           ${invoice.issuedAt.slice(0, 10)}`,
          "",
          `Bedrag excl. btw: ${formatEuro(invoice.netCents)}`,
          `21% btw:          ${formatEuro(invoice.btwCents)}`,
          `Totaal incl. btw: ${formatEuro(invoice.grossCents)}`,
          "",
          "Het bedrag is automatisch geïncasseerd via je gekoppelde betaalmethode.",
          "Opzeggen kan altijd met één tik in de app — dan stopt het abonnement",
          "aan het einde van de lopende maand.",
          "",
          companyLine(),
          "Connect · Clean · Thrive",
        ].join("\n"),
  };
}

/** New meeting request notification for the cleaner (brief §3.5). */
export function meetingRequestEmail(cleanerName: string, lang: Lang = "nl"): { subject: string; text: string } {
  return {
    subject: pick(lang, "Nieuwe kennismakingsaanvraag — Alieni", "New introduction request — Alieni"),
    text:
      lang === "en"
        ? [
            `Hi ${cleanerName},`,
            "",
            "You have a new introduction request on Alieni!",
            "Log in to view the request and accept it, propose another",
            "time, or decline.",
            "",
            "Responding within a day greatly improves your chance of a match.",
            "",
            "Cheers, Alieni · Connect · Clean · Thrive",
          ].join("\n")
        : [
            `Hoi ${cleanerName},`,
            "",
            "Je hebt een nieuwe kennismakingsaanvraag op Alieni!",
            "Log in om de aanvraag te bekijken en te accepteren, een ander",
            "moment voor te stellen, of af te wijzen.",
            "",
            "Reageren binnen een dag vergroot je kans op een match flink.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
  };
}

/** DSA status update for the person who filed a report (brief §6). */
export function reporterUpdateEmail(outcome: "hidden" | "removed" | "dismissed", contentChanged = true, lang: Lang = "nl"): {
  subject: string;
  text: string;
} {
  // contentChanged=false: the report type has no automatic hide/remove step, so do not claim one.
  const generic = pick(lang, "We hebben je melding beoordeeld en nemen passende maatregelen.", "We have reviewed your report and are taking appropriate action.");
  const outcomes = {
    hidden: contentChanged ? pick(lang, "De gemelde inhoud is verborgen terwijl we verder onderzoeken.", "The reported content has been hidden while we investigate further.") : generic,
    removed: contentChanged ? pick(lang, "De gemelde inhoud is verwijderd van het platform.", "The reported content has been removed from the platform.") : generic,
    dismissed: pick(
      lang,
      "We hebben je melding beoordeeld en geen overtreding van onze voorwaarden vastgesteld. De inhoud blijft staan.",
      "We have reviewed your report and found no violation of our terms. The content stays up.",
    ),
  } as const;
  return {
    subject: pick(lang, "Update over je melding — Alieni", "Update on your report — Alieni"),
    text:
      lang === "en"
        ? [
            "Hi,",
            "",
            "Thank you for your report on Alieni. We have reviewed it:",
            "",
            outcomes[outcome],
            "",
            "Do you disagree with this decision? Reply to this",
            "e-mail and we will take another look.",
            "",
            "Cheers, Alieni · Connect · Clean · Thrive",
          ].join("\n")
        : [
            "Hoi,",
            "",
            "Bedankt voor je melding op Alieni. We hebben deze beoordeeld:",
            "",
            outcomes[outcome],
            "",
            "Ben je het niet eens met deze beslissing? Reageer dan op deze",
            "e-mail; dan kijken we er opnieuw naar.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
  };
}

/** SEPA debit failed or reversed (brief v2 §11): connection paused. */
export function paymentFailedEmail(lang: Lang = "nl"): { subject: string; text: string } {
  return {
    subject: pick(lang, "Actie nodig: betaling mislukt — Alieni", "Action needed: payment failed — Alieni"),
    text:
      lang === "en"
        ? [
            "Hi,",
            "",
            "The automatic direct debit for your Alieni connection failed or",
            "was reversed. Your connection is therefore temporarily paused and",
            "contact details in the chat are hidden again.",
            "",
            "Update your payment method in the app; as soon as",
            "the payment succeeds, everything is active again right away.",
            "",
            "Questions? Just reply to this e-mail.",
            "",
            "Cheers, Alieni · Connect · Clean · Thrive",
          ].join("\n")
        : [
            "Hoi,",
            "",
            "De automatische incasso voor je Alieni-verbinding is mislukt of",
            "teruggedraaid. Je verbinding is daarom tijdelijk gepauzeerd en",
            "contactgegevens in de chat zijn weer verborgen.",
            "",
            "Werk je betaalmethode bij in de app; zodra de",
            "betaling slaagt, is alles direct weer actief.",
            "",
            "Vragen? Reageer gerust op deze e-mail.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
  };
}

/** Check-in after a quiet week (brief §3.10), sent by the checkins cron. */
export function checkinEmail(lang: Lang = "nl"): { subject: string; text: string } {
  return {
    subject: pick(lang, "Hebben jullie een match gevonden? — Alieni", "Did you find a match? — Alieni"),
    text:
      lang === "en"
        ? [
            "Hi!",
            "",
            "You had a nice conversation on Alieni, but it has gone quiet.",
            "Did you find a match? Confirm it in the app —",
            "only then do contact details become visible.",
            "Not the right click yet? There are plenty of other profiles waiting for you.",
            "",
            "Cheers, Alieni · Connect · Clean · Thrive",
          ].join("\n")
        : [
            "Hoi!",
            "",
            "Jullie hadden een leuk gesprek op Alieni, maar het is even stil.",
            "Hebben jullie een match gevonden? Bevestig het dan in de app —",
            "pas daarna zijn contactgegevens zichtbaar.",
            "Nog niet de juiste klik? Er staan genoeg andere profielen voor je klaar.",
            "",
            "Groetjes, Alieni · Connect · Clean · Thrive",
          ].join("\n"),
  };
}
