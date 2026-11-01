import { splitBtw } from "../money";
import type { AdminConnection, AdminPayment } from "./sample-admin-data";

/**
 * Admin KPIs (brief §8): revenue this month incl./excl. btw + btw amount,
 * active connections, churn. Pure functions over payment/connection rows,
 * identical for sample data and Supabase rows.
 */

export type Kpis = {
  revenueGrossCents: number;
  revenueNetCents: number;
  revenueBtwCents: number;
  activeConnections: number;
  endedThisMonth: number;
  churnPct: number;
};

function sameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export function computeKpis(
  payments: Pick<AdminPayment, "amountCents" | "status" | "paidAt">[],
  connections: Pick<AdminConnection, "status" | "endedAt">[],
  now: Date = new Date(),
): Kpis {
  const revenueGrossCents = payments
    .filter((p) => p.status === "paid" && p.paidAt && sameMonth(p.paidAt, now))
    .reduce((sum, p) => sum + p.amountCents, 0);
  const { netCents, btwCents } = splitBtw(revenueGrossCents);

  const activeConnections = connections.filter((c) => c.status === "active").length;
  const endedThisMonth = connections.filter(
    (c) => c.status === "ended" && c.endedAt && sameMonth(c.endedAt, now),
  ).length;
  const base = activeConnections + endedThisMonth;

  return {
    revenueGrossCents,
    revenueNetCents: netCents,
    revenueBtwCents: btwCents,
    activeConnections,
    endedThisMonth,
    churnPct: base === 0 ? 0 : Math.round((endedThisMonth / base) * 100),
  };
}
