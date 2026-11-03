/**
 * Turns a database error into a short code the forms can translate.
 * 'db_outdated' means the running code expects a column, table or function
 * that the database does not have yet: a setup-page part has not been run.
 */
export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function dbErrorCode(error: DbErrorLike, fallback: string = "save_failed"): string {
  if (!error) return fallback;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  // 42703 undefined_column, 42P01 undefined_table, 42883 undefined_function, PGRST202 unknown rpc, PGRST204 unknown column (PostgREST schema cache)
  if (["42703", "42P01", "42883", "PGRST202", "PGRST204"].includes(code) || /does not exist|could not find the .* column|schema cache/.test(msg)) return "db_outdated";
  if (/limit reached|limit \(/.test(msg)) return "rate_limit";
  return fallback;
}
