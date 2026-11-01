/**
 * CSV export for the accountant (brief §8). RFC 4180-style quoting;
 * semicolon separator because Dutch Excel expects it by default.
 */
export function toCsv(rows: Array<Record<string, string | number | null>>, separator = ";"): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | null): string => {
    const s = value === null ? "" : String(value);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(separator),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? null)).join(separator)),
  ];
  return lines.join("\r\n");
}
