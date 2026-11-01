/**
 * Fixed-window in-memory rate limiter for our own API routes.
 *
 * Scope note: this protects a single server instance (fine for webhook
 * abuse damping). Platform-wide limits on login/sign-up/messaging run at
 * the edge and in Supabase (see SECURITY.md pre-launch checklist).
 */

const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
  }
  return entry.count <= limit;
}
