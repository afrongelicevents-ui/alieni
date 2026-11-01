import { setRequestLocale } from "next-intl/server";
import { COMPANY_DETAILS } from "@/lib/invoices";

/**
 * Privacybeleid / Privacy policy (brief §6, GDPR/AVG).
 * CONCEPT — have this reviewed by a lawyer before launch.
 */

const nl = {
  title: "Privacybeleid",
  updated: "Laatst bijgewerkt: 1 november 2026 — CONCEPT, juridische toetsing vóór lancering vereist.",
  sections: [
    {
      h: "1. Wie wij zijn",
      p: [
        `${COMPANY_DETAILS.name} (${COMPANY_DETAILS.kvk}) is verwerkingsverantwoordelijke voor de persoonsgegevens die via het platform worden verwerkt. Contact: via het contactformulier op de site.`,
      ],
    },
    {
      h: "2. Welke gegevens we verwerken en waarom",
      p: [
        "Account: naam, e-mailadres, woonplaats en wachtwoord (versleuteld opgeslagen) — om je account te laten werken (uitvoering van de overeenkomst).",
        "Advertentie (schoonmakers): tarief, diensten, werkgebied (postcode + reisafstand), beschikbaarheid, profieltekst en foto — om je advertentie te tonen aan zoekende huishoudens en bedrijven.",
        "Berichten: chatberichten tussen gebruikers, waarin contactgegevens automatisch worden gemaskeerd tot beide partijen een deal bevestigen — om veilig contact mogelijk te maken en omzeiling van het platform tegen te gaan (gerechtvaardigd belang).",
        "Betalingen: betaalstatus, mandaat- en abonnementsgegevens via onze betaalprovider Mollie. Wij slaan zelf nooit kaart- of rekeninggegevens op.",
        "Meldingen: inhoud van meldingen en de afhandeling daarvan (wettelijke plicht, Digital Services Act).",
      ],
    },
    {
      h: "3. Wat we bewust NIET verwerken (dataminimalisatie)",
      p: [
        "Geen woonadressen: Alieni slaat nergens een adres op. Waar er wordt schoongemaakt, deel je zelf rechtstreeks met de schoonmaker — dat gaat buiten het platform om.",
        "Geen bank- of kaartgegevens: die blijven bij onze betaalprovider Mollie. Schoonmakers betalen nooit iets, dus van hen hebben we helemaal geen financiële gegevens.",
        "Geen identiteitsbewijzen, KvK-verificatie of VOG's: schoonmakers zijn zelfstandig; de klantrelatie is van hen, niet van Alieni.",
        "De postcode die je in de zoekbalk typt wordt alleen gebruikt om te zoeken en nooit opgeslagen.",
      ],
    },
    {
      h: "4. Waar je gegevens staan",
      p: [
        "Alle gegevens worden gehost binnen de Europese Unie (database en opslag bij Supabase in een EU-regio, hosting bij Vercel in de EU-regio). Betalingen lopen via Mollie B.V. (Nederland).",
      ],
    },
    {
      h: "5. Hoe lang we gegevens bewaren",
      p: [
        "Accountgegevens: zolang je account bestaat. Facturen en betaalgegevens: 7 jaar (fiscale bewaarplicht). Chatberichten: tot 2 jaar na het laatste bericht of zoveel eerder als je je account verwijdert. Meldingen: 2 jaar na afhandeling.",
      ],
    },
    {
      h: "6. Met wie we gegevens delen",
      p: [
        "Alleen met verwerkers die nodig zijn om het platform te laten werken: Supabase (database/opslag), Vercel (hosting), Mollie (betalingen) en onze e-mailprovider voor transactionele e-mail. Met al deze partijen zijn verwerkersovereenkomsten gesloten. We verkopen nooit gegevens.",
      ],
    },
    {
      h: "7. Jouw rechten (AVG)",
      p: [
        "Je kunt je gegevens inzien, corrigeren, exporteren en je account verwijderen via je accountinstellingen. Verwijdering wist je profiel, advertentie en berichten; factuurgegevens bewaren we zolang de wet dat eist.",
        "Klachten kun je indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).",
      ],
    },
    {
      h: "8. Cookies",
      p: [
        "Alieni gebruikt alleen functionele cookies die nodig zijn om in te loggen en het platform te laten werken. Er zijn geen tracking- of advertentiecookies; daarom is er geen cookiebanner nodig. Verandert dit, dan vragen we eerst toestemming.",
      ],
    },
  ],
};

const en = {
  title: "Privacy policy",
  updated: "Last updated: 1 November 2026 — DRAFT, requires legal review before launch.",
  sections: [
    {
      h: "1. Who we are",
      p: [
        `${COMPANY_DETAILS.name} (${COMPANY_DETAILS.kvk}) is the controller for personal data processed via the platform. Contact: via the contact form on the site.`,
      ],
    },
    {
      h: "2. What data we process and why",
      p: [
        "Account: name, email address, city and password (stored encrypted) — to make your account work (performance of the contract).",
        "Ad (cleaners): rate, services, working area (postcode + travel radius), availability, profile text and photo — to show your ad to searching households and businesses.",
        "Messages: chat messages between users, in which contact details are automatically masked until both parties confirm a deal — to enable safe contact and prevent platform circumvention (legitimate interest).",
        "Payments: payment status, mandate and subscription data via our payment provider Mollie. We never store card or bank details ourselves.",
        "Reports: the content of reports and their handling (legal obligation, Digital Services Act).",
      ],
    },
    {
      h: "3. What we deliberately do NOT process (data minimisation)",
      p: [
        "No home addresses: Alieni stores no address anywhere. Where the cleaning happens is something you share directly with the cleaner — outside the platform.",
        "No bank or card details: those stay with our payment provider Mollie. Cleaners never pay anything, so we hold no financial data about them at all.",
        "No identity documents, KvK verification or VOG certificates: cleaners are independent; the client relationship is theirs, not Alieni's.",
        "The postcode you type into the search bar is only used to search and is never stored.",
      ],
    },
    {
      h: "4. Where your data lives",
      p: [
        "All data is hosted within the European Union (database and storage at Supabase in an EU region, hosting at Vercel in the EU region). Payments run via Mollie B.V. (Netherlands).",
      ],
    },
    {
      h: "5. How long we keep data",
      p: [
        "Account data: as long as your account exists. Invoices and payment data: 7 years (tax retention obligation). Chat messages: up to 2 years after the last message, or sooner if you delete your account. Reports: 2 years after handling.",
      ],
    },
    {
      h: "6. Who we share data with",
      p: [
        "Only with processors needed to run the platform: Supabase (database/storage), Vercel (hosting), Mollie (payments) and our email provider for transactional email. Data processing agreements are in place with all of them. We never sell data.",
      ],
    },
    {
      h: "7. Your rights (GDPR)",
      p: [
        "You can access, correct and export your data and delete your account via your account settings. Deletion wipes your profile, ad and messages; invoice data is kept as long as the law requires.",
        "Complaints can be filed with the Dutch Data Protection Authority, Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).",
      ],
    },
    {
      h: "8. Cookies",
      p: [
        "Alieni only uses functional cookies needed to log in and make the platform work. There are no tracking or advertising cookies, so no cookie banner is required. If this changes, we will ask for consent first.",
      ],
    },
  ],
};

export default async function PrivacyPage({
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
