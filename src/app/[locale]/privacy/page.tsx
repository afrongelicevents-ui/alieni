import { setRequestLocale } from "next-intl/server";
import { companyLine, contactSentence } from "@/lib/company";

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
        `${companyLine()} is verwerkingsverantwoordelijke voor de persoonsgegevens die via het platform worden verwerkt.${contactSentence("nl")}`,
      ],
    },
    {
      h: "2. Welke gegevens we verwerken en waarom",
      p: [
        "Account: naam, e-mailadres, woonplaats en wachtwoord (versleuteld opgeslagen) — om je account te laten werken (uitvoering van de overeenkomst).",
        "Advertentie (schoonmakers): tarief, diensten, werkgebied (postcode + reisafstand), beschikbaarheid, profieltekst en foto — om je advertentie te tonen aan zoekende huishoudens en bedrijven.",
        "Bedrijfsgegevens (bedrijfsaccounts): bedrijfsnaam, optioneel btw-nummer, contactpersoon en de adressen van locaties — om je bedrijfsaccount en advertenties te laten werken.",
        "Voorkeuren (huishoudens): postcodegebied, woningtype en wensen — om passende schoonmakers te tonen.",
        "Reviews, werkregistraties en favorieten: door jou geschreven reviews, vastgelegde gewerkte tijden en de advertenties die je als favoriet markeert — om reviews, een overzicht van het werk en je favorietenlijst te tonen.",
        "Berichten: chatberichten tussen gebruikers, waarin contactgegevens automatisch worden gemaskeerd tot beide partijen een deal bevestigen — om veilig contact mogelijk te maken en omzeiling van het platform tegen te gaan (gerechtvaardigd belang).",
        "Betalingen: op dit moment worden er geen betalingen, abonnementen of incasso's verwerkt. Komen er in de toekomst betaalde functies, dan kondigen we dat vooraf aan, vragen we je toestemming en werken we met een betaalprovider (zoals Mollie). Wij slaan zelf nooit kaart- of rekeninggegevens op.",
        "Meldingen: inhoud van meldingen en de afhandeling daarvan (wettelijke plicht, Digital Services Act).",
      ],
    },
    {
      h: "3. Wat we bewust NIET verwerken (dataminimalisatie)",
      p: [
        "Beperkte adresgegevens: voor gewone zoekopdrachten en huishoudens slaat Alieni geen woonadres op; waar er wordt schoongemaakt, deel je zelf rechtstreeks met de schoonmaker. Uitzonderingen: bedrijfslocaties slaan hun adres op; van schoonmakers slaan we de postcode op en leiden we daaruit een nauwkeurige locatie af voor het zoeken op afstand — alleen het 4-cijferige postcodegebied is openbaar zichtbaar.",
        "Geen bank- of kaartgegevens: die slaan we niet op. Schoonmakers betalen nooit iets, dus van hen hebben we helemaal geen financiële gegevens.",
        "Geen identiteitsbewijzen, KvK-documenten of VOG's. Bedrijfsaccounts slaan bedrijfsnaam, een optioneel btw-nummer en een contactpersoon op. Schoonmakers zijn zelfstandig; de klantrelatie is van hen, niet van Alieni.",
        "De postcode die je in de zoekbalk typt wordt alleen gebruikt om te zoeken en nooit opgeslagen.",
      ],
    },
    {
      h: "4. Waar je gegevens staan",
      p: [
        "Gegevens worden opgeslagen binnen de Europese Unie (database en opslag bij Supabase in de EU); de website wordt gehost bij Vercel.",
      ],
    },
    {
      h: "5. Hoe lang we gegevens bewaren",
      p: [
        "Accountgegevens: zolang je account bestaat. Eventuele facturen en betaalgegevens (zodra die bestaan): 7 jaar (fiscale bewaarplicht). Chatberichten: tot 2 jaar na het laatste bericht of zoveel eerder als je je account verwijdert. Meldingen: 2 jaar na afhandeling.",
      ],
    },
    {
      h: "6. Met wie we gegevens delen",
      p: [
        "Alleen met verwerkers die nodig zijn om het platform te laten werken: Supabase (database/opslag), Vercel (hosting), Resend (transactionele e-mail), Cloudflare Turnstile (bescherming tegen bots, alleen als dit is ingeschakeld), PDOK (de Nederlandse overheidsdienst voor geocodering; die ontvangt postcodes en plaatsnamen die je in de zoekbalk typt) en, zodra er betaalde functies komen, een betaalprovider zoals Mollie. Waar nodig zijn verwerkersovereenkomsten gesloten. We verkopen nooit gegevens.",
      ],
    },
    {
      h: "7. Jouw rechten (AVG)",
      p: [
        "Je kunt je gegevens inzien en corrigeren in je profiel, ze als bestand downloaden en je account verwijderen op de pagina Account. Verwijdering wist je profiel, advertentie, favorieten en gesprekken; factuur- en betaalgegevens bewaren we zolang de wet dat eist, losgekoppeld van je naam waar dat kan.",
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
        `${companyLine()} is the controller for personal data processed via the platform.${contactSentence("en")}`,
      ],
    },
    {
      h: "2. What data we process and why",
      p: [
        "Account: name, email address, city and password (stored encrypted) — to make your account work (performance of the contract).",
        "Ad (cleaners): rate, services, working area (postcode + travel radius), availability, profile text and photo — to show your ad to searching households and businesses.",
        "Business data (business accounts): company name, optional VAT number, contact person and the addresses of locations — to make your business account and ads work.",
        "Preferences (households): postcode area, home type and needs — to show suitable cleaners.",
        "Reviews, work records and favourites: reviews you write, recorded work times and the ads you mark as favourite — to show reviews, an overview of the work and your favourites list.",
        "Messages: chat messages between users, in which contact details are automatically masked until both parties confirm a deal — to enable safe contact and prevent platform circumvention (legitimate interest).",
        "Payments: at the moment no payments, subscriptions or direct debits are processed. If paid features are introduced in the future, we will announce this in advance, ask for your consent and work with a payment provider (such as Mollie). We never store card or bank details ourselves.",
        "Reports: the content of reports and their handling (legal obligation, Digital Services Act).",
      ],
    },
    {
      h: "3. What we deliberately do NOT process (data minimisation)",
      p: [
        "Limited address data: for ordinary searches and households Alieni stores no home address; where the cleaning happens is something you share directly with the cleaner. Exceptions: business locations store their address; for cleaners we store the postcode and derive a precise location from it for distance search — only the 4-digit postcode area is publicly visible.",
        "No bank or card details: we do not store those. Cleaners never pay anything, so we hold no financial data about them at all.",
        "No identity documents, KvK documents or VOG certificates. Business accounts store a company name, an optional VAT number and a contact person. Cleaners are independent; the client relationship is theirs, not Alieni's.",
        "The postcode you type into the search bar is only used to search and is never stored.",
      ],
    },
    {
      h: "4. Where your data lives",
      p: [
        "Data is stored within the European Union (database and storage at Supabase in the EU); the website is hosted on Vercel.",
      ],
    },
    {
      h: "5. How long we keep data",
      p: [
        "Account data: as long as your account exists. Any invoices and payment data (once they exist): 7 years (tax retention obligation). Chat messages: up to 2 years after the last message, or sooner if you delete your account. Reports: 2 years after handling.",
      ],
    },
    {
      h: "6. Who we share data with",
      p: [
        "Only with processors needed to run the platform: Supabase (database/storage), Vercel (hosting), Resend (transactional email), Cloudflare Turnstile (bot protection, only if enabled), PDOK (the Dutch government geocoding service; it receives postcodes and towns you type into search) and, once paid features exist, a payment provider such as Mollie. Data processing agreements are in place where required. We never sell data.",
      ],
    },
    {
      h: "7. Your rights (GDPR)",
      p: [
        "You can see and correct your data in your profile, download it as a file and delete your account on the Account page. Deletion wipes your profile, ad, favourites and conversations; invoice and payment records are kept as long as the law requires, detached from your name where possible.",
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
