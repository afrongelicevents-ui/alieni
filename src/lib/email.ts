import "server-only";
import { formatEuro } from "./money";
import { COMPANY_DETAILS, type Invoice } from "./invoices";

/**
 * Transactional email via Resend (brief §6, §12 automations). Plain-text
 * on purpose: deliverability, accessibility, and nothing to maintain.
 * No-ops with a console warning while RESEND_API_KEY is not configured.
 */

const FROM = "Alieni <no-reply@alieni.nl>";

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  return res.ok;
}

/** Invoice email with the 21% btw breakdown (brief §3.7, §6). */
export function invoiceEmail(invoice: Invoice): { subject: string; text: string } {
  return {
    subject: `Factuur ${invoice.number} — Alieni`,
    text: [
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
      `${COMPANY_DETAILS.name} · ${COMPANY_DETAILS.kvk} · ${COMPANY_DETAILS.btw}`,
      "Connect · Clean · Thrive",
    ].join("\n"),
  };
}

/** New meeting request notification for the cleaner (brief §3.5). */
export function meetingRequestEmail(cleanerName: string): { subject: string; text: string } {
  return {
    subject: "Nieuwe kennismakingsaanvraag — Alieni",
    text: [
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
export function reporterUpdateEmail(outcome: "hidden" | "removed" | "dismissed"): {
  subject: string;
  text: string;
} {
  const outcomes = {
    hidden: "De gemelde inhoud is verborgen terwijl we verder onderzoeken.",
    removed: "De gemelde inhoud is verwijderd van het platform.",
    dismissed:
      "We hebben je melding beoordeeld en geen overtreding van onze voorwaarden vastgesteld. De inhoud blijft staan.",
  } as const;
  return {
    subject: "Update over je melding — Alieni",
    text: [
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
export function paymentFailedEmail(): { subject: string; text: string } {
  return {
    subject: "Actie nodig: betaling mislukt — Alieni",
    text: [
      "Hoi,",
      "",
      "De automatische incasso voor je Alieni-verbinding is mislukt of",
      "teruggedraaid. Je verbinding is daarom tijdelijk gepauzeerd en",
      "contactgegevens in de chat zijn weer verborgen.",
      "",
      "Werk je betaalmethode bij in de app (Account → Betalingen); zodra de",
      "betaling slaagt, is alles direct weer actief.",
      "",
      "Vragen? Reageer gerust op deze e-mail.",
      "",
      "Groetjes, Alieni · Connect · Clean · Thrive",
    ].join("\n"),
  };
}
