import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_DETAILS } from "@/lib/invoices";
import { formatEuro } from "@/lib/money";

/**
 * Invoice PDF (brief v2 §4). Access is enforced by row-level security:
 * the user's own Supabase client can only select invoices it owns.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: invoice } = await supabase
    .from("invoices")
    .select("number, net_cents, btw_cents, gross_cents, issued_at, business_id, household_id")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ ok: false }, { status: 404 });

  let customer = "";
  if (invoice.business_id) {
    const { data: b } = await supabase.from("business_profiles").select("company_name, kvk_number, btw_number").eq("id", invoice.business_id).maybeSingle();
    customer = b ? `${b.company_name}${b.kvk_number ? ` · KvK ${b.kvk_number}` : ""}${b.btw_number ? ` · BTW ${b.btw_number}` : ""}` : "";
  } else if (invoice.household_id) {
    const { data: p } = await supabase.from("profiles").select("display_name").eq("id", invoice.household_id).maybeSingle();
    customer = p?.display_name ?? "";
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const forest = rgb(0.055, 0.29, 0.173);
  const ink = rgb(0.043, 0.149, 0.09);
  const draw = (text: string, x: number, y: number, size = 11, f = font, color = ink) =>
    page.drawText(text, { x, y, size, font: f, color });

  draw("Alieni", 50, 780, 26, bold, forest);
  draw("Connect · Clean · Thrive", 50, 762, 10, font, forest);
  draw(`${COMPANY_DETAILS.name} · ${COMPANY_DETAILS.kvk} · ${COMPANY_DETAILS.btw}`, 50, 745, 9);

  draw("FACTUUR", 400, 780, 18, bold);
  draw(`Nummer: ${invoice.number}`, 400, 760, 10);
  draw(`Datum: ${String(invoice.issued_at).slice(0, 10)}`, 400, 746, 10);

  draw("Aan:", 50, 690, 10, bold);
  draw(customer || "—", 50, 675, 11);

  draw("Omschrijving", 50, 620, 10, bold);
  draw("Bedrag", 480, 620, 10, bold);
  page.drawLine({ start: { x: 50, y: 612 }, end: { x: 545, y: 612 }, thickness: 1, color: forest });
  draw(invoice.business_id ? "Alieni zakelijk — vast maandbedrag per eenheid" : "Alieni verbinding — maandbedrag", 50, 592, 11);
  draw(formatEuro(invoice.net_cents), 480, 592, 11);

  draw("Subtotaal excl. BTW", 330, 545, 11);
  draw(formatEuro(invoice.net_cents), 480, 545, 11);
  draw("BTW 21%", 330, 528, 11);
  draw(formatEuro(invoice.btw_cents), 480, 528, 11);
  page.drawLine({ start: { x: 330, y: 518 }, end: { x: 545, y: 518 }, thickness: 1, color: forest });
  draw("Totaal incl. BTW", 330, 500, 12, bold);
  draw(formatEuro(invoice.gross_cents), 480, 500, 12, bold);

  draw("Dit bedrag wordt automatisch geïncasseerd via SEPA-incasso (Mollie).", 50, 440, 9);
  draw("Vragen over deze factuur? Reageer op de factuur-e-mail.", 50, 426, 9);

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="alieni-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
