import { setRequestLocale } from "next-intl/server";
import { COMPANY_DETAILS } from "@/lib/invoices";

/**
 * Gebruiksvoorwaarden / Terms of use (brief §6).
 * CONCEPT — have this reviewed by a lawyer before launch.
 */

const nl = {
  title: "Gebruiksvoorwaarden",
  updated: "Laatst bijgewerkt: 1 november 2026 — CONCEPT, juridische toetsing vóór lancering vereist.",
  sections: [
    {
      h: "1. Wat Alieni is",
      p: [
        "Alieni is een online advertentieplatform dat huishoudens en bedrijven in contact brengt met zelfstandige schoonmakers. Alieni is géén schoonmaakbedrijf, géén uitzendbureau en géén bemiddelaar in arbeidsrelaties.",
        "Schoonmakers die op Alieni adverteren zijn zelfstandig en niet in dienst van Alieni. Alieni is geen partij bij de afspraken die gebruikers onderling maken en betaalt geen lonen uit; huishoudens en bedrijven betalen schoonmakers rechtstreeks.",
      ],
    },
    {
      h: "2. Geen verificatie — controleer elkaar",
      p: [
        "Alieni verifieert geen identiteitsbewijzen, KvK-nummers of VOG's. Gebruikers zijn zelf verantwoordelijk voor het controleren van elkaars identiteit, kwalificaties en betrouwbaarheid, bijvoorbeeld tijdens de kennismaking.",
        "Reviews op Alieni zijn afkomstig van verbindingen die beide partijen in de app hebben bevestigd.",
      ],
    },
    {
      h: "3. Accounts en advertenties",
      p: [
        "Een account is persoonlijk. Je gegevens moeten juist en actueel zijn. Schoonmakers plaatsen gratis een advertentie met een uurtarief van minimaal het platformminimum (op dit moment €15 per uur).",
        "Niet toegestaan: misleidende of valse advertenties, discriminerende uitingen, het omzeilen van het platform door contactgegevens te delen vóór een bevestigde deal, en elk gebruik dat in strijd is met de wet.",
      ],
    },
    {
      h: "4. Kosten",
      p: [
        "Zoeken, chatten en kennismaken is gratis. Pas wanneer een huishouden en een schoonmaker allebei een deal bevestigen, start voor het huishouden een abonnement van €14,95 per maand (inclusief 21% btw) per actieve verbinding.",
        "Opzeggen kan op elk moment met één druk op de knop; het abonnement stopt dan aan het einde van de lopende maand. Voor schoonmakers is Alieni altijd gratis. Prijzen voor bedrijven worden apart gepubliceerd en zijn exclusief btw.",
      ],
    },
    {
      h: "5. Meldingen en moderatie",
      p: [
        "Elke advertentie en elk profiel heeft een meldknop. Meldingen worden beoordeeld; Alieni kan content verbergen of verwijderen en accounts schorsen. De melder ontvangt een statusupdate over de afhandeling (Digital Services Act).",
      ],
    },
    {
      h: "6. Aansprakelijkheid",
      p: [
        "Alieni spant zich in voor een veilig en werkend platform, maar is niet aansprakelijk voor de kwaliteit van schoonmaakwerk, schade ontstaan tijdens werkzaamheden, of afspraken tussen gebruikers onderling. Dwingend consumentenrecht blijft onverkort van toepassing.",
      ],
    },
    {
      h: "7. Toepasselijk recht",
      p: [
        `Op deze voorwaarden is Nederlands recht van toepassing. ${COMPANY_DETAILS.name} · ${COMPANY_DETAILS.kvk} · ${COMPANY_DETAILS.btw}.`,
      ],
    },
  ],
};

const en = {
  title: "Terms of use",
  updated: "Last updated: 1 November 2026 — DRAFT, requires legal review before launch.",
  sections: [
    {
      h: "1. What Alieni is",
      p: [
        "Alieni is an online advertising marketplace that connects households and businesses with independent cleaners. Alieni is not a cleaning company, not an employment agency and not an intermediary in employment relationships.",
        "Cleaners advertising on Alieni are independent and not employed by Alieni. Alieni is not a party to the arrangements users make between themselves and pays no wages; households and businesses pay cleaners directly.",
      ],
    },
    {
      h: "2. No verification — check each other",
      p: [
        "Alieni does not verify identity documents, KvK numbers or VOG certificates. Users are responsible for checking each other's identity, qualifications and reliability, for example during the introduction meeting.",
        "Reviews on Alieni come from connections that both parties confirmed in the app.",
      ],
    },
    {
      h: "3. Accounts and ads",
      p: [
        "An account is personal. Your details must be accurate and up to date. Cleaners post a free ad with an hourly rate of at least the platform minimum (currently €15 per hour).",
        "Not allowed: misleading or false ads, discriminatory content, bypassing the platform by sharing contact details before a confirmed deal, and any use contrary to the law.",
      ],
    },
    {
      h: "4. Fees",
      p: [
        "Searching, chatting and meeting is free. Only when a household and a cleaner both confirm a deal does a subscription of €14.95 per month (including 21% VAT) per active connection start for the household.",
        "You can cancel at any time with one tap; the subscription then stops at the end of the current month. For cleaners, Alieni is always free. Business pricing is published separately and excludes VAT.",
      ],
    },
    {
      h: "5. Reports and moderation",
      p: [
        "Every ad and profile has a report button. Reports are reviewed; Alieni may hide or remove content and suspend accounts. The reporter receives a status update on the handling (Digital Services Act).",
      ],
    },
    {
      h: "6. Liability",
      p: [
        "Alieni strives for a safe and working platform but is not liable for the quality of cleaning work, damage arising during work, or arrangements between users. Mandatory consumer law remains fully applicable.",
      ],
    },
    {
      h: "7. Governing law",
      p: [
        `These terms are governed by Dutch law. ${COMPANY_DETAILS.name} · ${COMPANY_DETAILS.kvk} · ${COMPANY_DETAILS.btw}.`,
      ],
    },
  ],
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const content = locale === "en" ? en : nl;

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="headline text-3xl text-ink">{content.title}</h1>
      <p className="mt-2 rounded-xl bg-sun/25 p-3 text-xs font-semibold text-ink/70">{content.updated}</p>
      {content.sections.map((section) => (
        <section key={section.h} className="mt-8">
          <h2 className="headline text-xl text-ink">{section.h}</h2>
          {section.p.map((paragraph, i) => (
            <p key={i} className="mt-3 text-ink/80">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
