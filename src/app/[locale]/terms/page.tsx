import { setRequestLocale } from "next-intl/server";
import { companyLine } from "@/lib/company";

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
      h: "2. Geen controle door Alieni — controleer elkaar",
      p: [
        "Alieni verifieert de identiteit, kwalificaties of verzekering van schoonmakers niet. Gebruikers zijn zelf verantwoordelijk voor het controleren van elkaars identiteit, kwalificaties en betrouwbaarheid, bijvoorbeeld tijdens de kennismaking.",
        "Reviews op Alieni zijn afkomstig van verbindingen die beide partijen in de app hebben bevestigd.",
      ],
    },
    {
      h: "3. Accounts en advertenties",
      p: [
        "Een account is persoonlijk. Je gegevens moeten juist en actueel zijn. Schoonmakers plaatsen gratis een advertentie met een uurtarief van minimaal het minimale uurtarief dat het platform vaststelt (zichtbaar wanneer je je advertentie maakt).",
        "Niet toegestaan: misleidende of valse advertenties, discriminerende uitingen, het omzeilen van het platform door contactgegevens te delen vóór een bevestigde deal, en elk gebruik dat in strijd is met de wet.",
      ],
    },
    {
      h: "4. Kosten",
      p: [
        "Zoeken, chatten, kennismaken en adverteren is gratis. Op dit moment brengt Alieni geen kosten in rekening en worden er geen betalingen, abonnementen of incasso's verwerkt.",
        "Als Alieni in de toekomst kosten gaat rekenen, kondigen we dat vooraf aan en is daarvoor jouw toestemming nodig. Zonder jouw toestemming gaat er niets betaald worden en eindigt of wijzigt er niets in je gebruik van het platform.",
        "Schoonmakers houden 100% van hun tarief en er is geen commissie. Huishoudens en bedrijven betalen de schoonmaker rechtstreeks; Alieni zit niet tussen die betaling.",
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
        `Op deze voorwaarden is Nederlands recht van toepassing. ${companyLine()}.`,
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
      h: "2. No checks by Alieni — check each other",
      p: [
        "Alieni does not verify cleaners' identity, qualifications or insurance. Users are responsible for checking each other's identity, qualifications and reliability, for example during the introduction meeting.",
        "Reviews on Alieni come from connections that both parties confirmed in the app.",
      ],
    },
    {
      h: "3. Accounts and ads",
      p: [
        "An account is personal. Your details must be accurate and up to date. Cleaners post a free ad with an hourly rate of at least the minimum hourly rate set by the platform (shown when you create your ad).",
        "Not allowed: misleading or false ads, discriminatory content, bypassing the platform by sharing contact details before a confirmed deal, and any use contrary to the law.",
      ],
    },
    {
      h: "4. Fees",
      p: [
        "Searching, chatting, meeting and posting an ad is free. At the moment Alieni charges no fees and processes no payments, subscriptions or direct debits.",
        "If Alieni starts charging fees in the future, we will announce this in advance and it will need your consent. Without your consent nothing will be charged, and nothing about your use of the platform will end or change.",
        "Cleaners keep 100% of their rate and there is no commission. Households and businesses pay the cleaner directly; Alieni is not part of that payment.",
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
        `These terms are governed by Dutch law. ${companyLine()}.`,
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
