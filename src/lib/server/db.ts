import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * D1 access. Every query is a prepared statement with bound parameters (never string-built SQL from input).
 * There is no row-level security in D1: callers must check permissions BEFORE they read or write
 * (see src/lib/auth.ts requireUser/requireRole and the ownership checks in each action).
 */
export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  CRON_SECRET?: string;
  PAYMENTS_ACTIVE?: string;
};

export async function env(): Promise<Env> {
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env as unknown as Env;
}

export async function db(): Promise<D1Database> {
  return (await env()).DB;
}

type Param = string | number | null | boolean | undefined;
const bind = (params: Param[]) => params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

export async function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
  const r = await (await db()).prepare(sql).bind(...bind(params)).all<T>();
  return r.results ?? [];
}

export async function first<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | null> {
  return (await (await db()).prepare(sql).bind(...bind(params)).first<T>()) ?? null;
}

export async function run(sql: string, ...params: Param[]): Promise<number> {
  const r = await (await db()).prepare(sql).bind(...bind(params)).run();
  return r.meta?.changes ?? 0;
}

/** Several statements in one transaction (D1 batch = all or nothing). */
export async function batch(statements: [string, ...Param[]][]): Promise<void> {
  const d = await db();
  await d.batch(statements.map(([sql, ...p]) => d.prepare(sql).bind(...bind(p))));
}

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};
export const bool = (v: unknown) => v === 1 || v === true || v === "1";

/** Typed settings reader (settings.value is JSON). */
export async function setting<T>(key: string, fallback: T): Promise<T> {
  const row = await first<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row ? json<T>(row.value, fallback) : fallback;
}

/**
 * Fixed-window rate limit. Returns false when `key` was used more than `max` times in `windowSec`.
 * Used for sign-up, messages, reports and uploads.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const win = now - (now % windowSec);
  const row = await first<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
                                   window_start = excluded.window_start
     RETURNING count`, key, win);
  return (row?.count ?? 1) <= max;
}
