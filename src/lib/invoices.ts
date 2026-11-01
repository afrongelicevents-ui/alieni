import { HOUSEHOLD_FEE_CENTS, splitBtw } from "./money";

/**
 * Invoice construction (brief §6): sequential numbers, 21% btw breakdown,
 * company details. In production the number comes from the database
 * sequence (next_invoice_number()); the demo uses the same format.
 */

// [TO FILL] Agatha's registration details before launch (open decision §13).
export const COMPANY_DETAILS = {
  name: "Alieni",
  kvk: "KvK [NUMMER]",
  btw: "BTW [NUMMER]",
};

export type Invoice = {
  number: string;
  netCents: number;
  btwCents: number;
  grossCents: number;
  issuedAt: string;
  description: string;
};

export function formatInvoiceNumber(year: number, seq: number): string {
  return `ALI-${year}-${String(seq).padStart(4, "0")}`;
}

export function buildInvoice(params: {
  seq: number;
  grossCents?: number;
  issuedAt?: Date;
  description: string;
}): Invoice {
  const grossCents = params.grossCents ?? HOUSEHOLD_FEE_CENTS;
  const issuedAt = params.issuedAt ?? new Date();
  const { netCents, btwCents } = splitBtw(grossCents);
  return {
    number: formatInvoiceNumber(issuedAt.getFullYear(), params.seq),
    netCents,
    btwCents,
    grossCents,
    issuedAt: issuedAt.toISOString(),
    description: params.description,
  };
}
