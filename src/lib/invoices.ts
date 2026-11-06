import { COMPANY } from "./company";
import { splitBtw } from "./money";

/**
 * Invoice construction (brief §6): sequential numbers, 21% btw breakdown,
 * company details. In production the number comes from the database
 * sequence (next_invoice_number()); the demo uses the same format.
 */

// Company details come from the environment (see ./company.ts); nothing is shown as a placeholder.
export const COMPANY_DETAILS = {
  name: COMPANY.name,
  kvk: COMPANY.kvk ? `KvK ${COMPANY.kvk}` : "",
  btw: COMPANY.btw ? `BTW ${COMPANY.btw}` : "",
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
  /** The amount actually charged (from the payment); nothing is assumed. */
  grossCents: number;
  issuedAt?: Date;
  description: string;
}): Invoice {
  const grossCents = params.grossCents;
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
