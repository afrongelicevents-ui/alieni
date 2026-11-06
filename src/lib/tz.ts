/** Instants for wall-clock times in the Netherlands, correct in winter (+01:00) and summer time (+02:00). */
const FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function offsetMs(instantMs: number): number {
  const parts = FORMAT.formatToParts(new Date(instantMs));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second")) - instantMs;
}

/** "2026-07-04" + "11:00" (Amsterdam wall clock) → ISO instant in UTC. */
export function amsterdamInstant(date: string, time: string): string {
  const naive = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  let ms = naive - offsetMs(naive);
  ms = naive - offsetMs(ms); // second pass settles the hour around a clock change
  return new Date(ms).toISOString();
}

/** Same, from a local ISO string without offset: "2026-07-04T11:00:00". */
export function amsterdamInstantFromLocal(local: string): string {
  const [date, time = "00:00"] = local.split("T");
  return amsterdamInstant(date, time);
}
