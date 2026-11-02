/**
 * Emergency & replacement cover — pure rules (Phase 2), tested without a
 * database. The database functions enforce the same rules atomically.
 */
export type CoverRules = { cancelWindowHours: number; strikeLimit: number; maxDaysAhead: number };
export const DEFAULT_COVER_RULES: CoverRules = { cancelWindowHours: 4, strikeLimit: 2, maxDaysAhead: 14 };

/** settings.cover_rules → typed rules with defaults for anything missing. */
export function parseCoverRules(value: unknown): CoverRules {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0 ? (v[k] as number) : d);
  return { cancelWindowHours: num("cancel_window_hours", 4), strikeLimit: num("strike_limit", 2), maxDaysAhead: num("max_days_ahead", 14) };
}

/** Latest moment a business can cancel an accepted request without the fee event standing. */
export function cancelDeadline(windowStart: Date, rules: CoverRules = DEFAULT_COVER_RULES): Date {
  return new Date(windowStart.getTime() - rules.cancelWindowHours * 3600e3);
}

/** Inside the window (late) once `now` is past the deadline. */
export function isLateCancel(windowStart: Date, now: Date, rules: CoverRules = DEFAULT_COVER_RULES): boolean {
  return now.getTime() > cancelDeadline(windowStart, rules).getTime();
}

/** A no-show adds a strike; at the limit the cleaner's emergency opt-in is switched off. */
export function strikesRemoveOptIn(strikeCount: number, rules: CoverRules = DEFAULT_COVER_RULES): boolean {
  return strikeCount >= rules.strikeLimit;
}

/** Cover can be requested for today up to `maxDaysAhead` days ahead (date-only, UTC). */
export function isDateAllowed(date: string, today: Date, rules: CoverRules = DEFAULT_COVER_RULES): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  const t = new Date(today.toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const diffDays = Math.round((d - t) / 864e5);
  return diffDays >= 0 && diffDays <= rules.maxDaysAhead;
}

/** The attendance question is asked once the shift window has started. */
export function canReportAttendance(status: string, attendance: string, windowStart: Date, now: Date): boolean {
  return status === "accepted" && attendance === "unknown" && now.getTime() >= windowStart.getTime();
}
