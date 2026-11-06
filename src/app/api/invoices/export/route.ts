import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

/** CSV of the signed-in user's invoices for their bookkeeping (RLS-scoped). */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const { data: invoices } = await supabase
    .from("invoices")
    .select("number, issued_at, net_cents, btw_cents, gross_cents")
    .order("issued_at", { ascending: false });

  const rows = (invoices ?? []).map((i) => ({
    factuurnummer: i.number,
    datum: String(i.issued_at).slice(0, 10),
    bedrag_excl_btw: (i.net_cents / 100).toFixed(2),
    btw_21: (i.btw_cents / 100).toFixed(2),
    bedrag_incl_btw: (i.gross_cents / 100).toFixed(2),
  }));

  return new NextResponse("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alieni-facturen.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
